# KIParla Artifacts

This repository stores published KIParla artifacts derived from corpus data.

Current artifact types:

* HTML conversation pages
* PDF exports of orthographic and Jefferson transcripts
* shared CSS and JavaScript assets

## Repository layout

```text
KIParla-artifacts/
  css/
    linear2html.css
  js/
    linear2html.js
  KIP/
    html/
      BOA1001.html
      ...
    pdf/
      BOA1001-orthographic.pdf
      BOA1001-jefferson.pdf
      ...
  KIPasti/
    html/
    pdf/
  ParlaBO/
    html/
    pdf/
  ParlaTO/
    html/
    pdf/
```

Notes:

* only real source modules are stored here
* `KIParla-collection` is not a separate artifact subtree
* shared assets live at repository root in `css/` and `js/`
* module HTML pages reference shared assets via relative paths such as `../../css/linear2html.css`

## URL convention

Published conversation pages are expected at:

```text
<ARTIFACTS_BASE_URL>/<MODULE>/html/<CODE>.html
```

Examples:

```text
https://<org>.github.io/KIParla-artifacts/KIP/html/BOA1001.html
https://<org>.github.io/KIParla-artifacts/KIPasti/html/KPC001.html
https://<org>.github.io/KIParla-artifacts/ParlaBO/html/PBA001.html
https://<org>.github.io/KIParla-artifacts/ParlaTO/html/PTA001.html
```

PDFs are expected at:

```text
<ARTIFACTS_BASE_URL>/<MODULE>/pdf/<CODE>-orthographic.pdf
<ARTIFACTS_BASE_URL>/<MODULE>/pdf/<CODE>-jefferson.pdf
```

## Generating artifacts

Artifacts are generated from the `KIParla/tools` repository, primarily with `linear2html.py`.

Example:

```bash
python3 tools/linear2html.py \
  --orthographic ParlaTO/linear-orthographic/PTA005.txt \
  --jefferson ParlaTO/linear-jefferson/PTA005.txt \
  --tsv ParlaTO/tsv/PTA005.vert.tsv \
  --conversations ParlaTO/metadata/conversations.tsv \
  --participants ParlaTO/metadata/participants.tsv \
  --artifacts-root KIParla-artifacts
```

This writes:

* `KIParla-artifacts/ParlaTO/html/PTA005.html`
* `KIParla-artifacts/ParlaTO/pdf/PTA005-orthographic.pdf`
* `KIParla-artifacts/ParlaTO/pdf/PTA005-jefferson.pdf`

The module name is inferred from the metadata path by default.
You can override it with `--module`.

## Relation to corpus verticals

`full_conversation` links in NoSketch vertical files should point to this repository, not to local NoSketch static paths.

The vertical generator in `KIParla/tools/tsv2vert_v2.py` supports:

* `--base-url` for search/player links
* `--artifacts-base-url` for `full_conversation`
* `--artifacts-module` for explicit module routing when needed

For the aggregated `KIParla` corpus, the generator maps each conversation code back to its real source module (`KIP`, `KIPasti`, `ParlaBO`, `ParlaTO`).
