import { createElement, type FormEvent } from "react";

export interface TaskFormProps {
  repoUrl?: string;
  task?: string;
  baseBranch?: string;
  publishPullRequest?: boolean;
  busy?: boolean;
  submitting?: boolean;
  clearing?: boolean;
  onRepoUrlChange?: (value: string) => void;
  onTaskChange?: (value: string) => void;
  onBaseBranchChange?: (value: string) => void;
  onPublishPullRequestChange?: (value: boolean) => void;
  onSubmit?: (event: FormEvent) => void;
  onClear?: () => void;
}

// Built with createElement (no JSX): the Astro tsconfig covering web/
// preserves JSX, which the root vitest transform cannot parse here.
export function TaskForm({
  repoUrl = "",
  task = "",
  baseBranch = "main",
  publishPullRequest = false,
  busy = false,
  submitting = false,
  clearing = false,
  onRepoUrlChange,
  onTaskChange,
  onBaseBranchChange,
  onPublishPullRequestChange,
  onSubmit,
  onClear,
}: TaskFormProps = {}) {
  return createElement(
    "form",
    {
      "data-testid": "task-submission-form",
      "aria-label": "Task submission form",
      onSubmit: onSubmit ?? ((event: FormEvent) => event.preventDefault()),
      className: "form",
    },
    createElement(
      "label",
      { className: "field" },
      createElement("span", null, "Repository URL"),
      createElement("input", {
        type: "url",
        inputMode: "url",
        required: true,
        name: "repoUrl",
        placeholder: "https://github.com/owner/repo",
        value: repoUrl,
        onChange: (event: { target: { value: string } }) =>
          onRepoUrlChange?.(event.target.value),
      }),
    ),
    createElement(
      "label",
      { className: "field" },
      createElement("span", null, "Base branch"),
      createElement("input", {
        type: "text",
        name: "baseBranch",
        value: baseBranch,
        onChange: (event: { target: { value: string } }) =>
          onBaseBranchChange?.(event.target.value),
        placeholder: "main",
      }),
    ),
    createElement(
      "label",
      { className: "field" },
      createElement("span", null, "Task"),
      createElement("textarea", {
        required: true,
        name: "task",
        rows: 5,
        placeholder:
          "Describe the change you want, e.g. fix the login redirect and add a test.",
        value: task,
        onChange: (event: { target: { value: string } }) =>
          onTaskChange?.(event.target.value),
      }),
    ),
    createElement(
      "label",
      { className: "check" },
      createElement("input", {
        type: "checkbox",
        name: "publishPullRequest",
        checked: publishPullRequest,
        onChange: (event: { target: { checked: boolean } }) =>
          onPublishPullRequestChange?.(event.target.checked),
      }),
      createElement(
        "span",
        null,
        "Open a pull request with the result (requires GITHUB_TOKEN)",
      ),
    ),
    createElement(
      "div",
      { className: "actions" },
      createElement(
        "button",
        { type: "submit", disabled: busy },
        submitting ? "Submitting" : busy ? "Working" : "Send for approval",
      ),
      createElement(
        "button",
        {
          type: "button",
          onClick: onClear,
          className: "secondary",
          disabled: busy,
        },
        clearing ? "Clearing history" : "Clear history",
      ),
    ),
  );
}
