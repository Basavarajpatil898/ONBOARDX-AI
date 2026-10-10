from dataclasses import dataclass
from typing import Literal


GapCategory = Literal["strong", "moderate", "weak", "missing"]
AssessmentAction = Literal["revision", "practice", "advanced"]


@dataclass(frozen=True)
class SkillRequirement:
    skill: str
    required_level: int
    priority: int = 1


@dataclass(frozen=True)
class SkillGap:
    skill: str
    current_level: int | None
    required_level: int
    priority: int
    gap: int | None
    category: GapCategory
    priority_score: int
    explanation: str


@dataclass(frozen=True)
class LearningModule:
    module_id: str
    title: str
    skill: str
    prerequisites: tuple[str, ...] = ()


def analyze_skill_gaps(
    requirements: list[SkillRequirement], employee_skills: dict[str, int]
) -> list[SkillGap]:
    """Compare recorded employee proficiency with role requirements on a 0-5 scale."""
    gaps: list[SkillGap] = []
    for requirement in requirements:
        current = employee_skills.get(requirement.skill)
        if current is not None and not 0 <= current <= 5:
            raise ValueError(f"Skill level for {requirement.skill} must be between 0 and 5")
        if not 0 <= requirement.required_level <= 5 or requirement.priority < 1:
            raise ValueError("Requirements need a 0-5 level and positive priority")

        if current is None:
            category: GapCategory = "missing"
            gap = None
            priority_score = requirement.required_level * requirement.priority
            explanation = "No proficiency has been recorded for this required skill."
        else:
            gap = max(requirement.required_level - current, 0)
            category = "strong" if gap == 0 else "moderate" if gap == 1 else "weak"
            priority_score = gap * requirement.priority
            explanation = (
                f"Current level {current}/5 is {gap} level(s) below the "
                f"required level {requirement.required_level}/5."
                if gap
                else f"Current level {current}/5 meets the required level."
            )
        gaps.append(
            SkillGap(
                skill=requirement.skill,
                current_level=current,
                required_level=requirement.required_level,
                priority=requirement.priority,
                gap=gap,
                category=category,
                priority_score=priority_score,
                explanation=explanation,
            )
        )
    return sorted(gaps, key=lambda item: (-item.priority_score, item.skill.casefold()))


def calculate_role_readiness(
    requirements: list[SkillRequirement],
    employee_skills: dict[str, int],
    assessment_scores: dict[str, float] | None = None,
    practical_scores: dict[str, float] | None = None,
) -> dict:
    """Calculate a priority-weighted score from recorded, explainable evidence."""
    assessment_scores = assessment_scores or {}
    practical_scores = practical_scores or {}
    gaps = analyze_skill_gaps(requirements, employee_skills)
    if not gaps:
        return {
            "score_percent": None,
            "status": "unassigned",
            "method": "Assign role skill requirements to calculate readiness.",
            "skills": [],
        }

    requirements_by_skill = {item.skill: item for item in requirements}
    priority_total = sum(item.priority for item in requirements)
    skill_results = []
    weighted_score = 0.0
    all_skills_ready = True
    for gap in gaps:
        requirement = requirements_by_skill[gap.skill]
        current = employee_skills.get(gap.skill)
        proficiency_score = (
            min(current / requirement.required_level, 1.0) * 100
            if current is not None and requirement.required_level > 0
            else 100.0 if requirement.required_level == 0
            else None
        )
        assessment_score = assessment_scores.get(gap.skill)
        practical_score = practical_scores.get(gap.skill)
        for label, value in (("assessment", assessment_score), ("practical", practical_score)):
            if value is not None and not 0 <= value <= 100:
                raise ValueError(f"{label.title()} score for {gap.skill} must be between 0 and 100")

        evidence = [value for value in (proficiency_score, assessment_score, practical_score) if value is not None]
        score = sum(evidence) / len(evidence) if evidence else 0.0
        contribution = score * requirement.priority / priority_total
        weighted_score += contribution
        is_ready = gap.category == "strong" and score >= 100
        all_skills_ready = all_skills_ready and is_ready
        skill_results.append(
            {
                "skill": gap.skill,
                "current_level": current,
                "required_level": gap.required_level,
                "gap": gap.gap,
                "category": gap.category,
                "priority": requirement.priority,
                "score_percent": round(score, 1),
                "contribution_percent": round(contribution, 1),
                "proficiency_percent": round(proficiency_score, 1) if proficiency_score is not None else None,
                "assessment_percent": assessment_score,
                "practical_percent": practical_score,
                "evidence_count": len(evidence),
                "explanation": (
                    f"Evidence average: {', '.join(f'{value:.0f}%' for value in evidence)}. "
                    f"This skill contributes {contribution:.1f} points at priority {requirement.priority}."
                    if evidence
                    else "No proficiency, assessment, or practical evidence is recorded; this skill scores 0% until evidence is added."
                ),
            }
        )

    return {
        "score_percent": round(weighted_score, 1),
        "status": "ready" if all_skills_ready else "developing",
        "method": (
            "Each skill averages its available proficiency (relative to the role target), latest assessment, "
            "and practical evidence. Missing evidence contributes 0. The overall score is weighted by role priority. "
            "Learning completion and prerequisites control pathway progression, not skill proficiency."
        ),
        "skills": skill_results,
    }


def prioritize_learning_skills(gaps: list[SkillGap], readiness: dict) -> list[str]:
    """Prioritize assessed revision, practical reinforcement, then role skill gaps."""
    evidence = {item["skill"]: item for item in readiness.get("skills", [])}
    gap_order = {gap.skill: index for index, gap in enumerate(gaps)}
    prioritized = [gap for gap in gaps if gap.category != "strong"]

    def priority_key(gap: SkillGap) -> tuple[int, int, int, str]:
        result = evidence.get(gap.skill, {})
        assessment = result.get("assessment_percent")
        practical = result.get("practical_percent")
        if assessment is not None and assessment < 50:
            evidence_priority = 0
        elif practical is not None and practical < 80:
            evidence_priority = 1
        else:
            evidence_priority = 2
        return evidence_priority, gap_order[gap.skill], -gap.priority_score, gap.skill.casefold()

    return [gap.skill for gap in sorted(prioritized, key=priority_key)]


def assessment_action(score_percent: float) -> AssessmentAction:
    if not 0 <= score_percent <= 100:
        raise ValueError("Assessment score must be between 0 and 100")
    if score_percent < 50:
        return "revision"
    if score_percent <= 80:
        return "practice"
    return "advanced"


def build_learning_path(
    modules: list[LearningModule],
    prioritized_skills: list[str],
    completed_module_ids: set[str] | None = None,
) -> list[LearningModule]:
    """Order relevant modules by skill priority while enforcing prerequisites."""
    completed = completed_module_ids or set()
    by_id = {module.module_id: module for module in modules}
    if len(by_id) != len(modules):
        raise ValueError("Module identifiers must be unique")

    rank = {skill: index for index, skill in enumerate(prioritized_skills)}
    selected = {module.module_id for module in modules if module.skill in rank}

    def include_prerequisites(module_id: str, visiting: set[str]) -> None:
        if module_id in visiting:
            raise ValueError("Learning module prerequisites contain a cycle")
        module = by_id.get(module_id)
        if module is None:
            raise ValueError(f"Unknown prerequisite module: {module_id}")
        visiting.add(module_id)
        for prerequisite_id in module.prerequisites:
            if prerequisite_id not in completed:
                selected.add(prerequisite_id)
                include_prerequisites(prerequisite_id, visiting)
        visiting.remove(module_id)

    for module_id in tuple(selected):
        include_prerequisites(module_id, set())

    ordered: list[LearningModule] = []
    pending = selected - completed
    while pending:
        ready = [
            by_id[module_id]
            for module_id in pending
            if set(by_id[module_id].prerequisites).issubset(completed | {m.module_id for m in ordered})
        ]
        if not ready:
            raise ValueError("Learning module prerequisites contain a cycle")
        ready.sort(key=lambda module: (rank.get(module.skill, len(rank)), module.module_id))
        next_module = ready[0]
        ordered.append(next_module)
        pending.remove(next_module.module_id)
    return ordered