// Used by regenerate-artifacts.yml. Files a checklist item against one
// persistent tracking issue rather than opening a new issue per release —
// regenerating the HTML/PDF pages stays a manual, local step (PDF export needs
// pandoc + xelatex and takes long enough that it isn't run on a runner). Same
// pattern as KIParla-NoSketch-Data/.github/scripts/recompile-issue.js.
//
//   - An open issue with `label` already exists  -> comment the item on it.
//   - The most recent issue with `label` is closed -> reopen it, then comment.
//   - No issue with `label` exists yet            -> create one, with the
//     item as its initial body, labeled and assigned.
//
// Never opens more than one issue at a time: at most one open issue with
// `label` exists after this runs, and its checklist is the current list of
// modules waiting on a manual regeneration.

async function fileRegenerateItem(github, context, core, { label, assignee, item }) {
  const { owner, repo } = context.repo;

  // Issue creation/update rejects a label that doesn't exist yet in the
  // repo — create it (idempotent: ignore "already exists").
  try {
    await github.rest.issues.createLabel({
      owner, repo, name: label, color: "0e8a16",
      description: "A module's data changed and its HTML/PDF pages still need a manual regeneration",
    });
    core.info(`Created label "${label}"`);
  } catch (err) {
    if (err.status !== 422) throw err;
  }

  const open = await github.rest.issues.listForRepo({
    owner, repo, state: "open", labels: label, per_page: 1,
  });
  if (open.data.length > 0) {
    const issue = open.data[0];
    await github.rest.issues.createComment({
      owner, repo, issue_number: issue.number, body: item,
    });
    core.info(`Added item to open issue #${issue.number}`);
    return;
  }

  const closed = await github.rest.issues.listForRepo({
    owner, repo, state: "closed", labels: label, per_page: 1,
    sort: "updated", direction: "desc",
  });
  if (closed.data.length > 0) {
    const issue = closed.data[0];
    await github.rest.issues.update({
      owner, repo, issue_number: issue.number, state: "open",
    });
    await github.rest.issues.createComment({
      owner, repo, issue_number: issue.number, body: item,
    });
    core.info(`Reopened issue #${issue.number} and added item`);
    return;
  }

  const created = await github.rest.issues.create({
    owner, repo,
    title: "Artifacts pending regeneration",
    body: [
      "Auto-filed by `regenerate-artifacts.yml` whenever a module's NoSketch " +
        "corpus is regenerated from a release. Each item still needs " +
        "`tools/generate_artifacts.py` run locally with the command shown, " +
        "then the regenerated `html/` and `pdf/` committed and pushed. " +
        "Close the issue when the list is done; the next release reopens it.",
      "",
      item,
    ].join("\n"),
    labels: [label],
    assignees: assignee ? [assignee] : [],
  });
  core.info(`Filed new issue #${created.data.number}`);
}

module.exports = { fileRegenerateItem };
