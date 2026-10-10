import unittest

from app.main import app
from app.services.onboarding import (
    LearningModule,
    SkillRequirement,
    analyze_skill_gaps,
    assessment_action,
    build_learning_path,
    calculate_role_readiness,
    prioritize_learning_skills,
)


class OnboardingRulesTests(unittest.TestCase):
    def test_backend_app_imports_cleanly(self) -> None:
        self.assertIsNotNone(app)

    def test_skill_gaps_are_explained_and_prioritized(self) -> None:
        results = analyze_skill_gaps(
            [
                SkillRequirement("Python", 4),
                SkillRequirement("Docker", 3, priority=2),
                SkillRequirement("RAG", 3),
            ],
            {"Python": 4, "Docker": 0},
        )
        self.assertEqual([item.skill for item in results], ["Docker", "RAG", "Python"])
        self.assertEqual(results[0].category, "weak")
        self.assertIn("below", results[0].explanation)
        self.assertEqual(results[1].category, "missing")
        self.assertEqual(results[2].category, "strong")

    def test_assessment_boundaries_are_deterministic(self) -> None:
        self.assertEqual(assessment_action(49.99), "revision")
        self.assertEqual(assessment_action(50), "practice")
        self.assertEqual(assessment_action(80), "practice")
        self.assertEqual(assessment_action(80.01), "advanced")

    def test_prerequisites_precede_higher_priority_module(self) -> None:
        modules = [
            LearningModule("advanced-api", "Advanced API", "FastAPI", ("api-basics",)),
            LearningModule("docker-basics", "Docker Basics", "Docker"),
            LearningModule("api-basics", "API Basics", "FastAPI"),
        ]
        path = build_learning_path(modules, ["Docker", "FastAPI"])
        self.assertEqual(
            [module.module_id for module in path],
            ["docker-basics", "api-basics", "advanced-api"],
        )

    def test_completed_prerequisite_is_not_repeated(self) -> None:
        modules = [
            LearningModule("api-basics", "API Basics", "FastAPI"),
            LearningModule("advanced-api", "Advanced API", "FastAPI", ("api-basics",)),
        ]
        path = build_learning_path(modules, ["FastAPI"], {"api-basics"})
        self.assertEqual([module.module_id for module in path], ["advanced-api"])

    def test_role_readiness_is_priority_weighted_and_explainable(self) -> None:
        result = calculate_role_readiness(
            [SkillRequirement("Python", 4, priority=2), SkillRequirement("Docker", 2)],
            {"Python": 4, "Docker": 1},
            {"Python": 100},
        )

        self.assertEqual(result["score_percent"], 83.3)
        self.assertEqual(result["status"], "developing")
        self.assertEqual([item["skill"] for item in result["skills"]], ["Docker", "Python"])
        self.assertEqual(result["skills"][0]["score_percent"], 50)
        self.assertIn("priority 2", result["skills"][1]["explanation"])

    def test_role_readiness_averages_available_evidence(self) -> None:
        result = calculate_role_readiness(
            [SkillRequirement("FastAPI", 4)],
            {"FastAPI": 2},
            {"FastAPI": 80},
            {"FastAPI": 100},
        )

        skill = result["skills"][0]
        self.assertEqual(skill["proficiency_percent"], 50)
        self.assertEqual(skill["score_percent"], 76.7)
        self.assertEqual(skill["evidence_count"], 3)

    def test_role_readiness_reports_missing_evidence_and_unassigned_roles(self) -> None:
        missing = calculate_role_readiness([SkillRequirement("SQL", 3)], {})
        unassigned = calculate_role_readiness([], {})

        self.assertEqual(missing["score_percent"], 0)
        self.assertEqual(missing["skills"][0]["evidence_count"], 0)
        self.assertIn("No proficiency", missing["skills"][0]["explanation"])
        self.assertIsNone(unassigned["score_percent"])
        self.assertEqual(unassigned["status"], "unassigned")

    def test_low_assessment_and_practical_results_reprioritize_learning(self) -> None:
        gaps = analyze_skill_gaps(
            [SkillRequirement("Python", 4), SkillRequirement("Docker", 3)],
            {"Python": 2, "Docker": 1},
        )
        readiness = {
            "skills": [
                {"skill": "Python", "assessment_percent": 40, "practical_percent": None},
                {"skill": "Docker", "assessment_percent": 85, "practical_percent": 60},
            ]
        }

        self.assertEqual(prioritize_learning_skills(gaps, readiness), ["Python", "Docker"])


if __name__ == "__main__":
    unittest.main()