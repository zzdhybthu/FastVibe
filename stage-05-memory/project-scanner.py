#!/usr/bin/env python3
"""
project-scanner.py - Automatically detect project type, name, dependencies,
and other metadata by inspecting well-known config files.

Outputs JSON to stdout, intended to be consumed by fill-templates.sh --auto.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any


# ---------------------------------------------------------------------------
# Detection helpers
# ---------------------------------------------------------------------------

def _read_text(path: Path) -> str | None:
    """Return file contents or None if the file doesn't exist."""
    try:
        return path.read_text(encoding="utf-8")
    except (FileNotFoundError, PermissionError, OSError):
        return None


def _try_json(path: Path) -> dict[str, Any] | None:
    """Try to parse a JSON file; return dict or None."""
    text = _read_text(path)
    if text is None:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def _try_toml(path: Path) -> dict[str, Any] | None:
    """Try to parse a TOML file (Python 3.11+ or fallback)."""
    text = _read_text(path)
    if text is None:
        return None
    # Python 3.11+ ships tomllib
    try:
        import tomllib  # type: ignore[import-untyped]
        return tomllib.loads(text)
    except ImportError:
        pass
    # Fallback: try tomli (pip package)
    try:
        import tomli  # type: ignore[import-untyped]
        return tomli.loads(text)
    except ImportError:
        pass
    # Last resort: very naive extraction (name / description only)
    result: dict[str, Any] = {}
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("name") and "=" in line:
            result["name"] = line.split("=", 1)[1].strip().strip('"').strip("'")
        if line.startswith("description") and "=" in line:
            result["description"] = line.split("=", 1)[1].strip().strip('"').strip("'")
    return result if result else None


# ---------------------------------------------------------------------------
# Per-ecosystem scanners
# ---------------------------------------------------------------------------

def scan_node(project_dir: Path) -> dict[str, Any] | None:
    """Detect Node.js / JavaScript / TypeScript project."""
    pkg = _try_json(project_dir / "package.json")
    if pkg is None:
        return None

    deps = list((pkg.get("dependencies") or {}).keys())
    dev_deps = list((pkg.get("devDependencies") or {}).keys())

    frameworks: list[str] = []
    all_deps = deps + dev_deps
    if "next" in all_deps:
        frameworks.append("Next.js")
    if "react" in all_deps:
        frameworks.append("React")
    if "vue" in all_deps:
        frameworks.append("Vue")
    if "express" in all_deps:
        frameworks.append("Express")
    if "fastify" in all_deps:
        frameworks.append("Fastify")
    if "typescript" in all_deps:
        frameworks.append("TypeScript")

    tech = "Node.js"
    if frameworks:
        tech += " (" + ", ".join(frameworks) + ")"

    return {
        "project_name": pkg.get("name", ""),
        "description": pkg.get("description", ""),
        "tech_stack": tech,
        "dependencies": deps,
        "dev_dependencies": dev_deps,
    }


def scan_python(project_dir: Path) -> dict[str, Any] | None:
    """Detect Python project via pyproject.toml, setup.cfg, or requirements.txt."""
    # pyproject.toml
    toml_data = _try_toml(project_dir / "pyproject.toml")
    if toml_data is not None:
        project_section = toml_data.get("project") or toml_data.get("tool", {}).get("poetry", {})
        name = project_section.get("name", "") if isinstance(project_section, dict) else ""
        desc = project_section.get("description", "") if isinstance(project_section, dict) else ""
        deps_raw = project_section.get("dependencies", []) if isinstance(project_section, dict) else []
        if isinstance(deps_raw, dict):
            deps = list(deps_raw.keys())
        elif isinstance(deps_raw, list):
            deps = [d.split(">")[0].split("<")[0].split("=")[0].split("!")[0].split(";")[0].strip() for d in deps_raw]
        else:
            deps = []

        frameworks: list[str] = []
        dep_lower = [d.lower() for d in deps]
        if "fastapi" in dep_lower:
            frameworks.append("FastAPI")
        if "django" in dep_lower:
            frameworks.append("Django")
        if "flask" in dep_lower:
            frameworks.append("Flask")

        tech = "Python"
        if frameworks:
            tech += " (" + ", ".join(frameworks) + ")"

        return {
            "project_name": name,
            "description": desc,
            "tech_stack": tech,
            "dependencies": deps,
        }

    # requirements.txt fallback
    req_text = _read_text(project_dir / "requirements.txt")
    if req_text is not None:
        deps = []
        for line in req_text.splitlines():
            line = line.strip()
            if line and not line.startswith("#") and not line.startswith("-"):
                pkg = line.split(">")[0].split("<")[0].split("=")[0].split("!")[0].split(";")[0].strip()
                if pkg:
                    deps.append(pkg)
        return {
            "project_name": project_dir.name,
            "description": "",
            "tech_stack": "Python",
            "dependencies": deps,
        }

    return None


def scan_rust(project_dir: Path) -> dict[str, Any] | None:
    """Detect Rust project via Cargo.toml."""
    toml_data = _try_toml(project_dir / "Cargo.toml")
    if toml_data is None:
        return None
    package = toml_data.get("package", {})
    deps = list((toml_data.get("dependencies") or {}).keys())
    return {
        "project_name": package.get("name", ""),
        "description": package.get("description", ""),
        "tech_stack": "Rust",
        "dependencies": deps,
    }


def scan_go(project_dir: Path) -> dict[str, Any] | None:
    """Detect Go project via go.mod."""
    text = _read_text(project_dir / "go.mod")
    if text is None:
        return None
    module_name = ""
    deps: list[str] = []
    in_require = False
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("module "):
            module_name = stripped.split(None, 1)[1]
        if stripped == "require (":
            in_require = True
            continue
        if in_require:
            if stripped == ")":
                in_require = False
                continue
            parts = stripped.split()
            if parts:
                deps.append(parts[0])
    return {
        "project_name": module_name.rsplit("/", 1)[-1] if module_name else project_dir.name,
        "description": "",
        "tech_stack": "Go",
        "dependencies": deps,
    }


def scan_java(project_dir: Path) -> dict[str, Any] | None:
    """Detect Java project via pom.xml (Maven) or build.gradle (Gradle)."""
    pom = _read_text(project_dir / "pom.xml")
    if pom is not None:
        # Minimal XML extraction without importing xml.etree for robustness
        import re
        name_match = re.search(r"<artifactId>(.+?)</artifactId>", pom)
        desc_match = re.search(r"<description>(.+?)</description>", pom)
        return {
            "project_name": name_match.group(1) if name_match else project_dir.name,
            "description": desc_match.group(1) if desc_match else "",
            "tech_stack": "Java (Maven)",
            "dependencies": [],
        }

    gradle = _read_text(project_dir / "build.gradle") or _read_text(project_dir / "build.gradle.kts")
    if gradle is not None:
        return {
            "project_name": project_dir.name,
            "description": "",
            "tech_stack": "Java (Gradle)",
            "dependencies": [],
        }

    return None


# ---------------------------------------------------------------------------
# Git info
# ---------------------------------------------------------------------------

def scan_git(project_dir: Path) -> dict[str, str]:
    """Extract basic git info."""
    info: dict[str, str] = {}
    git_dir = project_dir / ".git"
    if not git_dir.exists():
        return info

    try:
        result = subprocess.run(
            ["git", "-C", str(project_dir), "remote", "get-url", "origin"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0:
            info["git_remote"] = result.stdout.strip()
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    try:
        result = subprocess.run(
            ["git", "-C", str(project_dir), "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0:
            info["git_branch"] = result.stdout.strip()
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    return info


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

SCANNERS = [
    scan_node,
    scan_python,
    scan_rust,
    scan_go,
    scan_java,
]


def scan_project(project_dir: Path) -> dict[str, Any]:
    """Run all scanners and merge results."""
    project_dir = project_dir.resolve()

    result: dict[str, Any] = {
        "project_name": project_dir.name,
        "description": "",
        "tech_stack": "",
        "architecture": "",
        "code_style": "",
        "known_issues": "- _None yet._",
        "custom_rules": "- _Add project-specific rules here._",
        "current_status": "Project scanned. Ready for development.",
        "dependencies": [],
        "dev_dependencies": [],
    }

    detected_stacks: list[str] = []

    for scanner in SCANNERS:
        info = scanner(project_dir)
        if info is None:
            continue
        # First scanner with a project name wins
        if info.get("project_name") and not result.get("_name_set"):
            result["project_name"] = info["project_name"]
            result["_name_set"] = True
        if info.get("description"):
            result["description"] = info["description"]
        if info.get("tech_stack"):
            detected_stacks.append(info["tech_stack"])
        if info.get("dependencies"):
            result["dependencies"] = list(set(result["dependencies"]) | set(info["dependencies"]))
        if info.get("dev_dependencies"):
            result["dev_dependencies"] = list(set(result["dev_dependencies"]) | set(info["dev_dependencies"]))

    if detected_stacks:
        result["tech_stack"] = ", ".join(detected_stacks)

    # Git info
    git_info = scan_git(project_dir)
    result.update(git_info)

    # Clean up internal flags
    result.pop("_name_set", None)

    return result


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Scan a project directory and output metadata as JSON.",
    )
    parser.add_argument(
        "--project-dir",
        type=str,
        default=".",
        help="Path to the project directory to scan (default: current directory).",
    )
    args = parser.parse_args()

    project_dir = Path(args.project_dir)
    if not project_dir.is_dir():
        print(f"Error: {project_dir} is not a directory.", file=sys.stderr)
        sys.exit(1)

    data = scan_project(project_dir)
    print(json.dumps(data, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
