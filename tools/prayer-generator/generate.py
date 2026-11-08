"""Generate template-based prayer PDFs with persistent, independent weekly draws."""
import argparse
from contextlib import contextmanager
from datetime import date
from io import BytesIO
import json
import os
from pathlib import Path
import random
import re
import tempfile

HERE = Path(__file__).resolve().parent
DEFAULT_OUTPUT = HERE.parents[1] / "prayer"

if os.name == "nt":
    import msvcrt
else:
    import fcntl


@contextmanager
def locked_file(path):
    with Path(path).open("a") as lock:
        if os.name == "nt":
            lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_LOCK, 1)
        else:
            fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            yield lock
        finally:
            if os.name == "nt":
                lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(lock, fcntl.LOCK_UN)


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
    paused = config.get('paused', [])
    if not isinstance(paused, list) or any(not isinstance(name, str) or name not in names for name in paused) or len(set(paused)) != len(paused):
        raise ValueError('paused must be a list of unique full names from names.')
    if len(names) - len(paused) < 2:
        raise ValueError('At least two people must remain active so everyone can be prayed for without self-assignments.')
    return week, names


def new_cycle(start, names, rng):
    order = list(names)
    offsets = list(range(1, len(names)))
    rng.shuffle(order)
    rng.shuffle(offsets)
    return {"start_week": start, "names": list(names), "order": order, "offsets": offsets}


def redistribute_paused(assignments, paused, rng, prior_loads=None, recent_helpers=None):
    """Match freed recipients to balanced active-person slots, never to themselves."""
    active = [name for name in assignments if name not in paused]
    recipients = [assignments[name] for name in paused]
    extras = {name: [] for name in active}
    if not recipients:
        return extras
    minimum, remainder = divmod(len(recipients), len(active))
    owners = active[:]
    rng.shuffle(owners)
    owners.sort(key=lambda owner: ((prior_loads or {}).get(owner, 0), (recent_helpers or {}).get(owner, 0)))
    slots = [owner for owner in owners for _ in range(minimum)]
    required = len(slots)
    if remainder:
        slots += owners
    matched = {}
    choices = list(range(len(recipients)))
    rng.shuffle(choices)

    def match(slot, visited):
        for recipient in choices:
            if recipient in visited or recipients[recipient] == slots[slot]:
                continue
            visited.add(recipient)
            if recipient not in matched or match(matched[recipient], visited):
                matched[recipient] = slot
                return True
        return False

    for slot in range(len(slots)):
        success = match(slot, set())
        if slot < required and not success:
            raise ValueError('Could not distribute paused assignments equally.')
        if len(matched) == len(recipients):
            break
    if len(matched) != len(recipients):
        raise ValueError('Could not distribute paused assignments without self-assignments.')
    for recipient, slot in matched.items():
        extras[slots[slot]].append(recipients[recipient])
    return {owner: recipients for owner, recipients in extras.items() if recipients}


def prayer_recipient_text(record, owner):
    if owner in record.get('paused', []):
        return '# oled praegu puhkusel #'
    recipients = [record['assignments'][owner]] + record.get('extra_assignments', {}).get(owner, [])
    return '\n'.join([recipients[0]] + [f'({name})' for name in recipients[1:]])


def apply_pause_settings(history, record, paused, rng):
    """Reapply pauses from the original rotation, retaining dates and main pairings."""
    if set(record.get('paused', [])) == set(paused):
        return record
    base = record.get('base_assignments')
    if base is None:
        if not record.get('paused'):
            base = dict(record['assignments'])
        else:
            cycle = next((cycle for cycle in history['cycles'] if cycle['start_week'] == record['cycle_start'] and cycle['names'] == record['names']), None)
            if not cycle:
                raise ValueError('Cannot restore the original rotation: its saved cycle is missing.')
            order, offset = cycle['order'], record['offset']
            base = {name: order[(i + offset) % len(order)] for i, name in enumerate(order)}
    prior = [week for week in history['weeks'].values() if week['week'] < record['week']]
    loads = {}
    for week in prior:
        for owner, recipients in week.get('extra_assignments', {}).items():
            loads[owner] = loads.get(owner, 0) + len(recipients)
    previous = max(prior, key=lambda week: week['week'], default={})
    recent = {owner: len(recipients) for owner, recipients in previous.get('extra_assignments', {}).items()}
    updated = {**record, 'base_assignments': dict(base), 'assignments': dict(base)}
    if paused:
        updated['paused'] = list(paused)
        updated['extra_assignments'] = redistribute_paused(base, paused, rng, loads, recent)
        for owner in paused:
            updated['assignments'][owner] = ''
    else:
        updated.pop('paused', None)
        updated.pop('extra_assignments', None)
    return updated


def plan_week(history, week, names, today=None, rng=None, paused=None):
    """Keep saved rotations and dates; explicit pause changes update only this week."""
    requested_paused = paused
    paused = list(paused or [])
    validate_config({"week": week, "names": names, "paused": paused})
    if history.get("version") != 1:
        raise ValueError("Unsupported history version; do not delete existing history.")
    key = str(week)
    if key in history["weeks"]:
        record = history["weeks"][key]
        effective_paused = record.get('paused', []) if requested_paused is None else paused
        validate_config({'week': week, 'names': record['names'], 'paused': effective_paused})
        record = apply_pause_settings(history, record, effective_paused, rng or random.SystemRandom())
        history['weeks'][key] = record
        return record
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
    record = apply_pause_settings(history, record, paused, rng)
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
                recipient_lines = recipient.split('\n')
                for recipient_index, recipient_line in enumerate(recipient_lines):
                    if recipient_index:
                        lines.textLine('')
                        lines.textOut(re.match(r'[ \t]*', line).group())
                    lines.textOut(recipient_line)
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
    with locked_file(history_path.with_suffix(".lock")):
        history = json.loads(history_path.read_text(encoding="utf-8")) if history_path.exists() else {
            "version": 1, "cycles": [], "weeks": {}}
        record = plan_week(history, week, names, paused=config.get('paused', []))
        if record["names"] != names:
            print(f"Week {week} already exists: using its saved roster and assignments.")
        existing = [Path(output) / owner.split()[0] / f"Nädal {week}.pdf"
                    for owner in record["assignments"]]
        existing = [path for path in existing if path.exists()]
        if existing:
            try:
                answer = input(f"Week {week}: {len(existing)} PDF(s) already exist. Overwrite? [y/N] ")
            except (EOFError, KeyboardInterrupt):
                answer = ''
            if answer.strip().lower() not in ('y', 'yes'):
                print("Cancelled. Existing PDFs and history were not changed.")
                return False
        documents = [
            (Path(output) / owner.split()[0] / f"Nädal {week}.pdf",
             make_pdf(render_text(template, record, owner, '[name_to_pray]'), prayer_recipient_text(record, owner), name_color))
            for owner, recipient in record["assignments"].items()
        ]
        # Save the draw before writing outputs so interrupted runs can be repeated.
        atomic_write(history_path, (json.dumps(history, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
        for path, content in documents:
            atomic_write(path, content)
        from update_index import write_index
        write_index(output, history_path)
        print(f"Generated {len(documents)} PDFs for week {week} in {Path(output).resolve()}")
        return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, default=HERE / 'config.json')
    parser.add_argument('--template', type=Path, default=HERE / 'sample.txt')
    parser.add_argument('--history', type=Path, default=HERE / 'history.json')
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    try:
        if not generate(args.config, args.template, args.history, args.output):
            return
        if args.config.resolve() == (HERE / 'config.json').resolve() and args.output.resolve() == DEFAULT_OUTPUT.resolve():
            from sync_config import sync_config
            sync_config()
    except (ValueError, OSError, ImportError, KeyError) as error:
        parser.exit(1, f"Generation failed: {error}\n")


if __name__ == '__main__':
    main()
