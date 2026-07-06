from __future__ import annotations

import argparse
import sys

from . import core


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m iaflow")
    sub = parser.add_subparsers(dest="command", required=True)

    init = sub.add_parser("init")
    init.add_argument("--force", action="store_true")

    sub.add_parser("browser-login")

    sub.add_parser("browser-cdp-check")

    browser_test = sub.add_parser("browser-test")
    browser_test.add_argument("role", choices=["strategic", "reviewer"])

    new = sub.add_parser("new")
    new.add_argument("task_id")
    new.add_argument("--title", required=True)
    new.add_argument("--force", action="store_true")

    strategic = sub.add_parser("run-strategic")
    strategic.add_argument("task_id")
    strategic.add_argument("--force", action="store_true")

    review = sub.add_parser("run-review")
    review.add_argument("task_id")

    finalize = sub.add_parser("finalize")
    finalize.add_argument("task_id")

    codex = sub.add_parser("run-codex")
    codex.add_argument("task_id")
    codex.add_argument("--dry-run", action="store_true")

    ingest = sub.add_parser("ingest")
    ingest.add_argument("task_id")

    status = sub.add_parser("status")
    status.add_argument("task_id")

    cycle = sub.add_parser("run-cycle")
    cycle.add_argument("task_id")

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        if args.command == "init":
            created = core.init_flow(force=args.force)
            print(f"Initialized ai-flow ({len(created)} files written).")
        elif args.command == "browser-login":
            core.browser_login()
            print("Browser login complete.")
        elif args.command == "browser-cdp-check":
            for line in core.browser_cdp_check():
                print(line)
        elif args.command == "browser-test":
            print(core.browser_test(args.role))
        elif args.command == "new":
            paths = core.new_task(args.task_id, args.title, force=args.force)
            print(f"Created {paths.root}")
        elif args.command == "run-strategic":
            core.run_strategic(args.task_id, force=args.force)
            print("Strategic output ready.")
        elif args.command == "run-review":
            core.run_review(args.task_id)
            print("Product review ready.")
        elif args.command == "finalize":
            core.finalize(args.task_id)
            print("Codex final prompt ready.")
        elif args.command == "run-codex":
            command = core.run_codex(args.task_id, dry_run=args.dry_run)
            if args.dry_run:
                print(" ".join(command))
            else:
                print("Codex run complete.")
        elif args.command == "ingest":
            core.ingest(args.task_id)
            print("Strategic gate review ready.")
        elif args.command == "status":
            print(core.format_status(core.status(args.task_id)))
        elif args.command == "run-cycle":
            core.run_cycle(args.task_id)
            print(core.format_status(core.status(args.task_id)))
        else:
            parser.error(f"Unknown command: {args.command}")
        return 0
    except Exception as exc:
        print(f"iaflow error: {exc}", file=sys.stderr)
        return 1
