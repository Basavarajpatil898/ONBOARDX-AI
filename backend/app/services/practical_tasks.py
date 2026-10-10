from typing import Any


def _value_at_path(data: dict[str, Any], path: str) -> tuple[bool, Any]:
    current: Any = data
    for part in path.split("."):
        if not isinstance(current, dict) or part not in current:
            return False, None
        current = current[part]
    return True, current


def evaluate_practical_task(output: dict[str, Any], checks: list[dict[str, Any]]) -> dict[str, Any]:
    """Evaluate structured outputs without executing employee-provided code."""
    if not checks:
        raise ValueError("Practical tasks must define at least one evaluation check.")
    supported_operators = {"equals", "exists", "type_is", "contains"}
    results = []
    for check in checks:
        operator = check.get("operator")
        path = check.get("path")
        if operator not in supported_operators or not isinstance(path, str) or not path:
            raise ValueError("A practical-task check has an invalid operator or output path.")
        exists, actual = _value_at_path(output, path)
        if operator == "exists":
            passed = exists
        elif operator == "equals":
            passed = exists and actual == check.get("value")
        elif operator == "type_is":
            type_names = {"str": str, "int": int, "float": (float, int), "bool": bool, "list": list, "dict": dict}
            expected_type = type_names.get(check.get("value"))
            passed = exists and expected_type is not None and isinstance(actual, expected_type)
        else:
            expected = check.get("value")
            passed = exists and isinstance(actual, (str, list, dict)) and expected in actual
        results.append(
            {
                "label": check.get("label", path),
                "path": path,
                "operator": operator,
                "passed": bool(passed),
            }
        )
    score = round(sum(result["passed"] for result in results) / len(results) * 100, 2)
    return {"score_percent": score, "passed": score == 100, "checks": results}