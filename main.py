import argparse
import json
import os
import sys
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo


API_ROOT = "https://codeforces.com/api"
DAILY_OUTPUT_FILE = Path("codeforces_daily_solved.json")
DASHBOARD_OUTPUT_FILE = Path("codeforces_dashboard_data.json")
DEFAULT_HANDLE = "DarkVoidd"
DEFAULT_TIMEZONE = "Asia/Amman"


def parse_args():
    parser = argparse.ArgumentParser(
        description="Generate Codeforces dashboard JSON files."
    )
    parser.add_argument(
        "--handle",
        default=os.getenv("CODEFORCES_HANDLE", DEFAULT_HANDLE),
        help="Codeforces handle. Can also be set with CODEFORCES_HANDLE.",
    )
    parser.add_argument(
        "--timezone",
        default=os.getenv("CF_TIMEZONE", DEFAULT_TIMEZONE),
        help=f"Timezone used for daily grouping. Default: {DEFAULT_TIMEZONE}.",
    )
    parser.add_argument(
        "--daily-output",
        default=str(DAILY_OUTPUT_FILE),
        help=f"Daily solved JSON path. Default: {DAILY_OUTPUT_FILE}.",
    )
    parser.add_argument(
        "--dashboard-output",
        default=str(DASHBOARD_OUTPUT_FILE),
        help=f"Combined dashboard JSON path. Default: {DASHBOARD_OUTPUT_FILE}.",
    )
    return parser.parse_args()


def call_codeforces_api(method, params):
    """Call a public Codeforces API method and return its result list."""
    query = urllib.parse.urlencode(params)
    url = f"{API_ROOT}/{method}?{query}"
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "codeforces-dashboard/1.0",
            "Accept": "application/json",
        },
    )

    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))

    if payload.get("status") != "OK":
        comment = payload.get("comment", "Unknown Codeforces API error")
        raise RuntimeError(f"{method} failed: {comment}")

    return payload.get("result", [])


def fetch_submissions(handle):
    return call_codeforces_api(
        "user.status",
        {"handle": handle, "from": 1, "count": 100000},
    )


def fetch_contest_rating(handle):
    return call_codeforces_api("user.rating", {"handle": handle})


def problem_key(problem):
    """Deduplicate solved problems by contestId + index from user.status."""
    contest_id = problem.get("contestId")
    index = problem.get("index")

    if contest_id is not None and index is not None:
        return f"{contest_id}-{index}"

    return None


def skipped_submission_payload(submission):
    problem = submission.get("problem", {})
    return {
        "creationTimeSeconds": submission.get("creationTimeSeconds"),
        "problem": {
            "name": problem.get("name"),
            "contestId": problem.get("contestId"),
            "problemsetName": problem.get("problemsetName"),
            "index": problem.get("index"),
        },
    }


def date_from_timestamp(seconds, tz):
    return datetime.fromtimestamp(seconds, tz=timezone.utc).astimezone(tz).date()


def safe_tags(problem):
    tags = problem.get("tags")
    return tags if isinstance(tags, list) and tags else ["Untagged"]


def safe_rating(problem):
    return problem.get("rating") if problem.get("rating") is not None else None


def problem_payload(problem):
    return {
        "name": problem.get("name", "Unnamed problem"),
        "contestId": problem.get("contestId"),
        "index": problem.get("index"),
        "rating": safe_rating(problem),
        "ratingLabel": str(problem["rating"]) if problem.get("rating") is not None else "Unrated",
        "tags": safe_tags(problem),
    }


def add_count(counter, key, amount=1):
    counter[key] += amount


def sorted_counter_items(counter):
    return [
        {"name": name, "count": count}
        for name, count in sorted(counter.items(), key=lambda item: (-item[1], str(item[0])))
    ]


def rating_breakdown_items(counter):
    def sort_key(item):
        name = item[0]
        return (1, 0) if name == "Unrated" else (0, int(name))

    return [
        {"rating": name, "count": count}
        for name, count in sorted(counter.items(), key=sort_key)
    ]


def build_daily_months(solved_by_day, today):
    """Keep the original monthly shape so the old daily solved chart still works."""
    if solved_by_day:
        current_day = min(solved_by_day)
    else:
        current_day = today

    months = defaultdict(list)

    while current_day <= today:
        month_key = current_day.strftime("%Y-%m")
        months[month_key].append(
            {
                "date": current_day.isoformat(),
                "solved": solved_by_day[current_day],
            }
        )
        current_day += timedelta(days=1)

    return [
        {
            "month": month,
            "totalSolved": sum(day["solved"] for day in days),
            "days": days,
        }
        for month, days in sorted(months.items())
    ]


def calculate_consistency(daily_months):
    daily_rows = [day for month in daily_months for day in month["days"]]
    active_rows = [day for day in daily_rows if day["solved"] > 0]

    longest_streak = 0
    running_streak = 0
    for day in daily_rows:
        if day["solved"] > 0:
            running_streak += 1
            longest_streak = max(longest_streak, running_streak)
        else:
            running_streak = 0

    current_streak = 0
    for day in reversed(daily_rows):
        if day["solved"] == 0:
            break
        current_streak += 1

    active_dates = [datetime.fromisoformat(day["date"]).date() for day in active_rows]
    gaps = [
        max((active_dates[index] - active_dates[index - 1]).days - 1, 0)
        for index in range(1, len(active_dates))
    ]

    total_tracked_days = len(daily_rows)
    total_active_days = len(active_rows)

    return {
        "currentStreak": current_streak,
        "longestStreak": longest_streak,
        "zeroDays": total_tracked_days - total_active_days,
        "activeDayPercentage": round(
            (total_active_days / total_tracked_days) * 100,
            2,
        )
        if total_tracked_days
        else 0,
        "averageGapBetweenActiveDays": round(sum(gaps) / len(gaps), 2) if gaps else 0,
        "totalActiveDays": total_active_days,
        "totalTrackedDays": total_tracked_days,
    }


def analyze_submissions(submissions, contest_ratings, handle, tz):
    submissions = sorted(submissions, key=lambda item: item.get("creationTimeSeconds", 0))
    today = datetime.now(tz).date()

    verdict_counts = defaultdict(int)
    rating_counts = defaultdict(int)
    tag_counts = defaultdict(int)
    solved_by_day = defaultdict(int)
    solved_problems_by_day = defaultdict(list)
    monthly_solved_problems = defaultdict(list)

    problem_history = {}
    first_accept_by_problem = {}
    accepted_count_by_problem = defaultdict(int)
    debug = {
        "totalSubmissions": len(submissions),
        "acceptedSubmissions": 0,
        "uniqueSolvedCount": 0,
        "skippedAcceptedSubmissionsBecauseMissingKey": 0,
        "acceptedSubmissionsWithMissingContestId": 0,
        "acceptedSubmissionsWithMissingIndex": 0,
        "acceptedSubmissionsWithProblemsetName": 0,
        "acceptedGymLikeSubmissions": 0,
        "topSkippedAcceptedSubmissions": [],
        "note": "Codeforces profile solved count may use internal counting rules different from public API calculation.",
    }

    for submission in submissions:
        verdict = submission.get("verdict", "UNKNOWN")
        add_count(verdict_counts, verdict)

        problem = submission.get("problem", {})
        key = problem_key(problem)

        if verdict == "OK":
            debug["acceptedSubmissions"] += 1

            if problem.get("contestId") is None:
                debug["acceptedSubmissionsWithMissingContestId"] += 1

            if problem.get("index") is None:
                debug["acceptedSubmissionsWithMissingIndex"] += 1

            if problem.get("problemsetName") is not None:
                debug["acceptedSubmissionsWithProblemsetName"] += 1

            contest_id = problem.get("contestId")
            if isinstance(contest_id, int) and contest_id >= 100000:
                debug["acceptedGymLikeSubmissions"] += 1

            if key is None:
                debug["skippedAcceptedSubmissionsBecauseMissingKey"] += 1
                if len(debug["topSkippedAcceptedSubmissions"]) < 20:
                    debug["topSkippedAcceptedSubmissions"].append(
                        skipped_submission_payload(submission)
                    )

        if key is None:
            continue

        attempt_date = date_from_timestamp(submission["creationTimeSeconds"], tz)

        if key not in problem_history:
            problem_history[key] = {
                "key": key,
                "dateFirstAttempted": attempt_date.isoformat(),
                "dateFirstAccepted": None,
                **problem_payload(problem),
                "verdictHistory": [],
                "attempts": 0,
                "attemptsBeforeFirstAC": None,
                "solved": False,
            }

        history = problem_history[key]
        history["attempts"] += 1
        history["verdictHistory"].append(verdict)

        if verdict != "OK":
            continue

        accepted_count_by_problem[key] += 1

        if key in first_accept_by_problem:
            continue

        # First AC is the moment this problem becomes a unique solved problem.
        history["solved"] = True
        history["dateFirstAccepted"] = attempt_date.isoformat()
        history["attemptsBeforeFirstAC"] = history["attempts"] - 1
        first_accept_by_problem[key] = submission

        solved_by_day[attempt_date] += 1
        solved_problem = problem_payload(problem)
        solved_problem["key"] = key
        solved_problems_by_day[attempt_date].append(solved_problem)
        monthly_solved_problems[attempt_date.strftime("%Y-%m")].append(solved_problem)

        add_count(rating_counts, solved_problem["ratingLabel"])
        for tag in solved_problem["tags"]:
            add_count(tag_counts, tag)

    daily_solved = build_daily_months(solved_by_day, today)
    consistency = calculate_consistency(daily_solved)

    best_date = None
    if solved_by_day:
        best_date = max(solved_by_day, key=lambda day: solved_by_day[day])

    best_training_day = {
        "date": best_date.isoformat() if best_date else None,
        "totalSolved": solved_by_day[best_date] if best_date else 0,
        "problems": solved_problems_by_day[best_date] if best_date else [],
    }

    attempts_per_problem = [
        {
            "key": key,
            "contestId": history["contestId"],
            "index": history["index"],
            "name": history["name"],
            "attemptsBeforeFirstAC": history["attemptsBeforeFirstAC"],
        }
        for key, history in problem_history.items()
        if history["solved"]
    ]
    attempts_per_problem.sort(key=lambda item: (-item["attemptsBeforeFirstAC"], item["key"]))

    repeated_problems = [
        {
            "key": key,
            "contestId": problem_history[key]["contestId"],
            "index": problem_history[key]["index"],
            "name": problem_history[key]["name"],
            "acceptedSubmissions": count,
        }
        for key, count in accepted_count_by_problem.items()
        if count > 1
    ]
    repeated_problems.sort(key=lambda item: (-item["acceptedSubmissions"], item["key"]))

    monthly_improvement = []
    for month, problems in sorted(monthly_solved_problems.items()):
        ratings = [problem["rating"] for problem in problems if problem["rating"] is not None]
        active_days = {
            day.isoformat()
            for day, day_problems in solved_problems_by_day.items()
            if day.strftime("%Y-%m") == month and day_problems
        }
        monthly_improvement.append(
            {
                "month": month,
                "totalSolved": len(problems),
                "averageRating": round(sum(ratings) / len(ratings), 2) if ratings else None,
                "activeDays": len(active_days),
            }
        )

    contest_performance = [
        {
            "contestName": row.get("contestName"),
            "rank": row.get("rank"),
            "oldRating": row.get("oldRating"),
            "newRating": row.get("newRating"),
            "ratingDelta": row.get("newRating", 0) - row.get("oldRating", 0),
        }
        for row in contest_ratings
    ]

    problem_list = sorted(
        problem_history.values(),
        key=lambda item: (item["dateFirstAttempted"], item["key"]),
    )
    debug["uniqueSolvedCount"] = len(first_accept_by_problem)

    return {
        "handle": handle,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "timezone": str(tz),
        "dailySolved": daily_solved,
        "ratingBreakdown": rating_breakdown_items(rating_counts),
        "tagsBreakdown": sorted_counter_items(tag_counts),
        "verdictAnalysis": sorted_counter_items(verdict_counts),
        "attemptsPerProblem": attempts_per_problem,
        "repeatedProblems": repeated_problems,
        "bestTrainingDay": best_training_day,
        "monthlyImprovement": monthly_improvement,
        "contestPerformance": contest_performance,
        "problemList": problem_list,
        "consistency": consistency,
        "debug": debug,
        "summary": {
            "totalUniqueSolvedProblems": len(first_accept_by_problem),
            "totalSubmissions": len(submissions),
            "totalUniqueAttemptedProblems": len(problem_history),
        },
    }


def write_json(path, data):
    Path(path).write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def main():
    args = parse_args()
    tz = ZoneInfo(args.timezone)

    print(f"Using Codeforces handle: {args.handle}")
    submissions = fetch_submissions(args.handle)
    contest_ratings = fetch_contest_rating(args.handle)
    dashboard_data = analyze_submissions(submissions, contest_ratings, args.handle, tz)

    write_json(args.daily_output, dashboard_data["dailySolved"])
    write_json(args.dashboard_output, dashboard_data)

    print(f"Generated {args.daily_output}")
    print(f"Generated {args.dashboard_output}")
    print(f"Submissions: {dashboard_data['summary']['totalSubmissions']}")
    print(f"Unique solved problems: {dashboard_data['summary']['totalUniqueSolvedProblems']}")
    print("Debug:")
    print(f"  Total submissions: {dashboard_data['debug']['totalSubmissions']}")
    print(f"  Accepted submissions: {dashboard_data['debug']['acceptedSubmissions']}")
    print(f"  Unique solved count: {dashboard_data['debug']['uniqueSolvedCount']}")
    print(
        "  Skipped accepted submissions because missing key: "
        f"{dashboard_data['debug']['skippedAcceptedSubmissionsBecauseMissingKey']}"
    )
    print(
        "  Accepted submissions with missing contestId: "
        f"{dashboard_data['debug']['acceptedSubmissionsWithMissingContestId']}"
    )
    print(
        "  Accepted submissions with missing index: "
        f"{dashboard_data['debug']['acceptedSubmissionsWithMissingIndex']}"
    )
    print(
        "  Accepted submissions with problemsetName: "
        f"{dashboard_data['debug']['acceptedSubmissionsWithProblemsetName']}"
    )
    print(
        "  Gym-like accepted submissions: "
        f"{dashboard_data['debug']['acceptedGymLikeSubmissions']}"
    )
    print("  Top skipped accepted submissions:")
    for skipped in dashboard_data["debug"]["topSkippedAcceptedSubmissions"]:
        print(f"    {json.dumps(skipped, ensure_ascii=False)}")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)
