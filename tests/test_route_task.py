import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import route_task
import task_board


def write_rules(temp_dir: str, body: str) -> str:
    path = Path(temp_dir) / "rules.md"
    path.write_text(body, encoding="utf-8")
    return str(path)


class RouteTaskRuleParsingTests(unittest.TestCase):
    def test_parse_rules_supports_optional_keyword_fields(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            rules_file = write_rules(
                temp_dir,
                """## 写文案
- hero: 吴用
- state: writing
- detail: 吴用正在写文案
- keywords: 写文案，文案
- strong_keywords: 写一版超短文案，写一句定位
- weak_keywords: 定位，收尾
- exclude_keywords: 录屏，截图
- examples: 写一版超短文案, 写一句定位
- priority: 10
""",
            )

            rules = route_task.parse_rules(rules_file)

        self.assertEqual(len(rules), 1)
        self.assertEqual(rules[0].strong_keywords, ["写一版超短文案", "写一句定位"])
        self.assertEqual(rules[0].weak_keywords, ["定位", "收尾"])
        self.assertEqual(rules[0].exclude_keywords, ["录屏", "截图"])
        self.assertEqual(rules[0].examples, ["写一版超短文案", "写一句定位"])


class RouteTaskMatchingTests(unittest.TestCase):
    def test_prefers_strong_demo_writing_rule_over_broad_research_terms(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            rules_file = write_rules(
                temp_dir,
                """## 研究亮点
- hero: 宋江
- state: researching
- detail: 宋江正在研究亮点
- keywords: 研究，分析，亮点
- strong_keywords: 先研究，做个分析
- priority: 9

## 写文案
- hero: 吴用
- state: writing
- detail: 吴用正在写文案
- keywords: 写文案，写一版
- strong_keywords: 写一版超短文案，写一句定位
- weak_keywords: 定位，收尾
- priority: 10
""",
            )
            rules = route_task.parse_rules(rules_file)

        match = route_task.pick_rule("把你刚才的两条观察，写一版超短文案。", rules)

        self.assertIsNotNone(match)
        self.assertEqual(match["rule"].state, "writing")
        self.assertEqual(match["matched_strong_keywords"], ["写一版超短文案"])

    def test_ignores_rule_when_exclude_keyword_matches(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            rules_file = write_rules(
                temp_dir,
                """## 截图录屏
- hero: 武松
- state: executing
- detail: 武松正在录屏
- keywords: 录屏，截图
- strong_keywords: 开始录屏，停止录屏
- exclude_keywords: 文案，定位，收尾，亮点
- priority: 11

## 研究亮点
- hero: 宋江
- state: researching
- detail: 宋江正在研究亮点
- keywords: 亮点
- strong_keywords: 先研究，做个分析
- priority: 9
""",
            )
            rules = route_task.parse_rules(rules_file)

        match = route_task.pick_rule("先研究录屏宣传片里最适合展示的两个亮点，做个分析。", rules)

        self.assertIsNotNone(match)
        self.assertEqual(match["rule"].state, "researching")

    def test_returns_no_match_for_weak_keyword_only_hit(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            rules_file = write_rules(
                temp_dir,
                """## 写文案
- hero: 吴用
- state: writing
- detail: 吴用正在写文案
- keywords: 写文案
- weak_keywords: 定位，收尾
- priority: 10
""",
            )
            rules = route_task.parse_rules(rules_file)

        self.assertIsNone(route_task.pick_rule("我想要一个定位", rules))

    def test_prefers_sync_rule_for_publish_note_prompt_without_ambiguity(self) -> None:
        rules = route_task.parse_rules(route_task.RULES_FILE)

        explanation = route_task.explain_task("整理一份发布说明", rules)

        self.assertIsNotNone(explanation["best"])
        self.assertEqual(explanation["best"]["state"], "syncing")
        self.assertEqual(explanation["best"]["title"], "同步 / 上传 / 下载 / 对接")
        self.assertGreaterEqual(len(explanation["top_candidates"]), 2)
        self.assertGreater(
            explanation["top_candidates"][0]["score"] - explanation["top_candidates"][1]["score"],
            route_task.AMBIGUITY_GAP,
        )


class RouteTaskReportTests(unittest.TestCase):
    def test_generates_report_for_benchmark_cases(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            benchmark_file = Path(temp_dir) / "benchmark.json"
            benchmark_file.write_text(
                json.dumps(
                    [
                        {"task": "写一版超短文案", "expected_state": "writing"},
                        {"task": "先研究这个产品最适合展示的两个亮点", "expected_state": "researching"},
                        {"task": "完全未知的模糊请求", "expect_match": False},
                    ],
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            report = route_task.generate_report(route_task.parse_rules(route_task.RULES_FILE), str(benchmark_file))

        self.assertEqual(report["total"], 3)
        self.assertIn("passed", report)
        self.assertIn("fallback_cases", report)
        self.assertIn("state_totals", report)
        self.assertIn("rule_totals", report)

    def test_repo_benchmark_cases_pass(self) -> None:
        benchmark_file = Path(__file__).with_name("fixtures") / "route_task_benchmark.json"

        report = route_task.generate_report(route_task.parse_rules(route_task.RULES_FILE), str(benchmark_file))

        self.assertEqual(report["failed"], 0, report["failed_cases"])
        self.assertEqual(report["state_totals"]["syncing"], 5)
        self.assertEqual(report["state_totals"]["executing"], 2)
        self.assertEqual(report["state_totals"]["error"], 1)
        self.assertEqual(report["rule_totals"]["Git / 分支 / 合并 / 提交"], 1)


class TaskBoardFallbackTests(unittest.TestCase):
    def test_command_start_uses_neutral_idle_fallback_when_no_rule_matches(self) -> None:
        saved_payloads: list[dict] = []

        def fake_save_state(payload, **kwargs):
            snapshot = dict(payload)
            snapshot["request_id"] = kwargs.get("request_id") or "req-1"
            saved_payloads.append(snapshot)
            return snapshot

        with mock.patch.object(task_board.route_task, "parse_rules", return_value=[]):
            with mock.patch.object(task_board.route_task, "pick_rule", return_value=None):
                with mock.patch.object(task_board, "load_state", return_value={"state": "idle", "detail": "", "hero": "宋江"}):
                    with mock.patch.object(task_board, "save_state", side_effect=fake_save_state):
                        rc = task_board.command_start("完全未知的模糊请求", "unused")

        self.assertEqual(rc, 0)
        self.assertEqual(saved_payloads[-1]["state"], "idle")
        self.assertEqual(saved_payloads[-1]["hero"], "宋江")
        self.assertEqual(saved_payloads[-1]["task_board_reason"], "route_fallback_idle")


if __name__ == "__main__":
    unittest.main()
