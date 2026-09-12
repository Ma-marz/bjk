# Prayer PDF generator

Edit `config.json`: set `week` manually and edit the full names in `names`.
The initial roster contains the eight active names from the old generator.
Week 24 is the next week after its last configured week (23); change it as needed.
The old generator and existing PDFs have not been modified or imported.

From the repository root (macOS/Linux):

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r tools/prayer-generator/requirements.txt
.venv/bin/python tools/prayer-generator/generate.py
```

The command works from any directory. Outputs go to
`prayer/<first name>/Nädal <week>.pdf`, matching the website. First names must be
unique, and at least two people are required.

Edit `sample.txt` to design the document. Blank lines, spaces, and the existing
ASCII artwork are preserved. Available placeholders:

- `[name]`: owner of the PDF
- `[name_to_pray]`: assigned person
- `[nr]`: manually selected week
- `[date]`: date the week was first generated, in DD.MM.YYYY format

All placeholders are optional. Omit any of them to leave that information out;
PDFs still generate for everyone, even with a blank template.

`[name_to_pray]` is rendered in bold Courier using `name_color` in `config.json`.
Use a six-digit hex color, such as `"name_color": "#FF0000"` for red,
`"#0000FF"` for blue, or `"#000000"` for black. Red is the default when omitted.
Changing the color and rerunning a week preserves its assignments and date.
Surrounding text remains
regular black Courier, with the template's spacing preserved.

Rendering retains the original letter page, Courier 11, 50-point starting
margins, and line spacing. This is a fixed single-page text layout: keep lines
and content within the page, just as with the original template.

The generator shuffles names and offsets 1 through N−1 for each cycle. It never
assigns a person themselves. Each person gets every other person exactly once
per cycle. A fresh cycle is a new random draw; across cycle boundaries some
assignments can repeat (unavoidable with only two people).

Keep and commit `history.json` together with generated PDFs. It stores the cycles,
weekly assignments, rosters, and original dates. Rerunning a generated week uses
that saved record even if today's roster differs; editing the template still
updates the PDFs. With the same template and ReportLab version, reruns produce
identical PDF bytes. Do not delete history to regenerate a layout.

For a new week, a changed roster starts a new cycle at that week. An unchanged
roster starts another cycle when N−1 weeks have elapsed. Skipped week numbers
consume rotation slots. New weeks must be generated in increasing order;
previously generated weeks can always be rerun. Ungenerated older weeks are
rejected to avoid rewriting later cycles. There is intentionally no automatic
reset of an existing week's assignments.

History is saved atomically before PDF files are replaced. Interrupted output
writes can be repaired by running the same command again. Concurrent invocations
using the same history file are serialized. `history.lock` is a local lock file.

For an isolated preview without changing production history or PDFs:

```sh
.venv/bin/python tools/prayer-generator/generate.py \
  --history /tmp/bjk-preview/history.json --output /tmp/bjk-preview/pdfs
```

Run tests:

```sh
.venv/bin/python -m unittest discover -s tools/prayer-generator -p 'test_*.py'
```

The generator also refreshes `prayer/available-weeks.js`, which lists each user's
actual PDFs for the website dropdown. Commit this index with the PDFs. If you
manually add, rename, or delete PDFs, rebuild it from the repository root:

```sh
python3 tools/prayer-generator/update_index.py
```

The index supports gaps in week numbers and works over HTTP and direct file access.
