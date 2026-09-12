"""Generate template-based prayer PDFs with persistent, independent weekly draws."""
import argparse
from datetime import date
import fcntl
from io import BytesIO
import json
import os
from pathlib import Path
import random
import re
import tempfile

HERE = Path(__file__).resolve().parent
DEFAULT_OUTPUT = HERE.parents[1] / "prayer"


def validate_config(config):
    week = config.get("week")
    names = config.get("names")
    if type(week) is not int or week < 1:
        raise ValueError("week must be a positive integer.")
    if not isinstance(names, list) or len(names) < 2:
        raise ValueError("Provide at least two names.")
    folders = set()
    for name in names:
        if not isinstance(name, str) or not name.strip() or name != name.strip():
            raise ValueError("Names must be nonempty strings without surrounding spaces.")
        if any(ord(c) < 32 for c in name) or any(c in name for c in '/\\'):
            raise ValueError(f"Invalid name: {name!r}")
        folder = name.split()[0]
        if folder in (".", "..") or folder.casefold() in folders:
            raise ValueError("Names must have unique first names for the website's PDF folders.")
        folders.add(folder.casefold())
    return week, names


def new_cycle(start, names, rng):
    order = list(names)
    offsets = list(range(1, len(names)))
    rng.shuffle(order)
    rng.shuffle(offsets)
    return {"start_week": start, "names": list(names), "order": order, "offsets": offsets}


def plan_week(history, week, names, today=None, rng=None):
    """Reuse saved weeks; new rosters start new cycles without rewriting history."""
    validate_config({"week": week, "names": names})
    if history.get("version") != 1:
        raise ValueError("Unsupported history version; do not delete existing history.")
    key = str(week)
    if key in history["weeks"]:
        return history["weeks"][key]
    if history["weeks"] and week < max(map(int, history["weeks"])):
        raise ValueError("This older week was never generated. Generate new weeks in increasing order.")
    rng = rng or random.SystemRandom()
    cycles = history["cycles"]
    if not cycles or cycles[-1]["names"] != names:
        cycles.append(new_cycle(week, names, rng))
    cycle = cycles[-1]
    # Advance through skipped weeks rather than shifting the existing schedule.
    while week >= cycle["start_week"] + len(cycle["offsets"]):
        cycle = new_cycle(cycle["start_week"] + len(cycle["offsets"]), names, rng)
        cycles.append(cycle)
    offset = cycle["offsets"][week - cycle["start_week"]]
    order = cycle["order"]
    record = {
        "week": week,
        "date": (today or date.today()).isoformat(),
        "names": list(names),
        "cycle_start": cycle["start_week"],
        "offset": offset,
        "assignments": {name: order[(i + offset) % len(order)] for i, name in enumerate(order)},
    }
    history["weeks"][key] = record
    return record


def atomic_write(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()


def render_text(template, record, owner, recipient):
    values = {
        "nr": str(record["week"]), "name": owner, "name_to_pray": recipient,
        "date": date.fromisoformat(record["date"]).strftime("%d.%m.%Y"),
    }
    return re.sub(r"\[(nr|name|name_to_pray|date)\]", lambda m: values[m[1]], template)


def parse_name_color(value):
    if not isinstance(value, str) or not re.fullmatch(r'#[0-9a-fA-F]{6}', value):
        raise ValueError('name_color must be a six-digit hex color, for example #FF0000.')
    return tuple(int(value[i:i + 2], 16) / 255 for i in (1, 3, 5))


def make_pdf(text, recipient=None, name_color='#FF0000'):
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas

    color = parse_name_color(name_color)
    buffer = BytesIO()
    # Keep the original letter page, Courier 11, 50-point margins and line spacing.
    pdf = canvas.Canvas(buffer, pagesize=letter, invariant=1)
    pdf.setFont("Courier", 11)
    lines = pdf.beginText(50, letter[1] - 50)
    for line in text.split('\n'):
        parts = line.split('[name_to_pray]') if recipient is not None else [line]
        for index, part in enumerate(parts):
            if index:
                lines.setFont('Courier-Bold', 11)
                lines.setFillColorRGB(*color)
                lines.textOut(recipient)
                lines.setFont('Courier', 11)
                lines.setFillColorRGB(0, 0, 0)
            lines.textOut(part)
        lines.textLine('')
    pdf.drawText(lines)
    pdf.save()
    return buffer.getvalue()


def generate(config_path, template_path, history_path, output):
    config = json.loads(Path(config_path).read_text(encoding="utf-8"))
    week, names = validate_config(config)
    name_color = config.get('name_color', '#FF0000')
    parse_name_color(name_color)
    template = Path(template_path).read_text(encoding="utf-8")
    history_path = Path(history_path)
    history_path.parent.mkdir(parents=True, exist_ok=True)
    # Serialize runs so two invocations cannot save different draws for one week.
    with history_path.with_suffix(".lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        history = json.loads(history_path.read_text(encoding="utf-8")) if history_path.exists() else {
            "version": 1, "cycles": [], "weeks": {}}
        record = plan_week(history, week, names)
        if record["names"] != names:
            print(f"Week {week} already exists: using its saved roster and assignments.")
        documents = [
            (Path(output) / owner.split()[0] / f"Nädal {week}.pdf",
             make_pdf(render_text(template, record, owner, '[name_to_pray]'), recipient, name_color))
            for owner, recipient in record["assignments"].items()
        ]
        # Save the draw before writing outputs so interrupted runs can be repeated.
        atomic_write(history_path, (json.dumps(history, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
        for path, content in documents:
            atomic_write(path, content)
        from update_index import write_index
        write_index(output)
        print(f"Generated {len(documents)} PDFs for week {week} in {Path(output).resolve()}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, default=HERE / 'config.json')
    parser.add_argument('--template', type=Path, default=HERE / 'sample.txt')
    parser.add_argument('--history', type=Path, default=HERE / 'history.json')
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    try:
        generate(args.config, args.template, args.history, args.output)
    except (ValueError, OSError, ImportError, KeyError) as error:
        parser.exit(1, f"Generation failed: {error}\n")


if __name__ == '__main__':
    main()
