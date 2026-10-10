import unittest

from app.services.practical_tasks import evaluate_practical_task


class PracticalTaskTests(unittest.TestCase):
    def test_structured_checks_report_each_result(self) -> None:
        result = evaluate_practical_task(
            {"status": 201, "body": {"name": "Example", "active": True}},
            [
                {"label": "Created response", "path": "status", "operator": "equals", "value": 201},
                {"label": "Name exists", "path": "body.name", "operator": "exists"},
                {"label": "Active is boolean", "path": "body.active", "operator": "type_is", "value": "bool"},
            ],
        )
        self.assertEqual(result["score_percent"], 100)
        self.assertTrue(result["passed"])
        self.assertTrue(all(check["passed"] for check in result["checks"]))

    def test_missing_or_incorrect_values_fail_without_running_code(self) -> None:
        result = evaluate_practical_task(
            {"status": "201"},
            [
                {"path": "status", "operator": "equals", "value": 201},
                {"path": "body.name", "operator": "exists"},
            ],
        )
        self.assertEqual(result["score_percent"], 0)
        self.assertFalse(result["passed"])

    def test_unsupported_rules_are_rejected(self) -> None:
        with self.assertRaises(ValueError):
            evaluate_practical_task({}, [{"path": "x", "operator": "execute", "value": "anything"}])


if __name__ == "__main__":
    unittest.main()