import { describe, expect, it, vi } from "vitest";
import { handleSlackEvent, type SlackMentionDeps } from "../src/slack-mention.js";
import type { SlackEventCallbackBody } from "../src/slack-events.js";

const REPO = "https://github.com/owner/repo";
const THREAD = "slack:T1:C1:1758217392.000100";

type QueueRun = NonNullable<SlackMentionDeps["queueRun"]>;
type PostMessage = NonNullable<SlackMentionDeps["postMessage"]>;

function mention(overrides: Record<string, unknown> = {}): SlackEventCallbackBody {
  return {
    type: "event_callback",
    event_id: "Ev1",
    team_id: "T1",
    event: {
      type: "app_mention",
      user: "U1",
      channel: "C1",
      ts: "1758217392.000100",
      text: `<@U0> fix the tests ${REPO}`,
      ...overrides,
    },
  };
}

function env(overrides: Record<string, unknown> = {}) {
  return { SLACK_BOT_TOKEN: "xoxb-test", ...overrides } as never;
}

describe("slack mention dispatch", () => {
  it("queues a run and posts an approval card when a GitHub URL is in the mention", async () => {
    const queueRun = vi.fn<QueueRun>(async () => ({ approvalId: "appr_1" }));
    const postMessage = vi.fn<PostMessage>(async () => {});
    await handleSlackEvent(mention(), env(), {
      queueRun,
      postMessage,
      fetchThread: async () => [],
    });
    expect(queueRun).toHaveBeenCalledOnce();
    const queued = queueRun.mock.calls.at(0)?.at(0);
    expect(queued).toMatchObject({ threadKey: THREAD, repoUrl: REPO });
    expect(postMessage).toHaveBeenCalledOnce();
    const posted = postMessage.mock.calls.at(0)?.at(0);
    expect(posted?.blocks).toBeDefined();
    expect(posted?.text).toContain(REPO);
  });

  it("uses SLACK_CHANNEL_REPOS when the mention has no URL", async () => {
    const queueRun = vi.fn<QueueRun>(async () => ({ approvalId: "appr_1" }));
    const postMessage = vi.fn<PostMessage>(async () => {});
    await handleSlackEvent(
      mention({ text: "<@U0> fix this" }),
      env({ SLACK_CHANNEL_REPOS: JSON.stringify({ C1: REPO }) }),
      { queueRun, postMessage, fetchThread: async () => [] },
    );
    expect(queueRun).toHaveBeenCalledOnce();
    expect(queueRun.mock.calls.at(0)?.at(0)?.repoUrl).toBe(REPO);
  });

  it("asks in-thread and starts no run when the repo cannot be resolved", async () => {
    const queueRun = vi.fn<QueueRun>(async () => ({ approvalId: "appr_1" }));
    const postMessage = vi.fn<PostMessage>(async () => {});
    await handleSlackEvent(mention({ text: "<@U0> fix this" }), env(), {
      queueRun,
      postMessage,
      fetchThread: async () => [],
    });
    expect(queueRun).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledOnce();
    const asked = postMessage.mock.calls.at(0)?.at(0);
    expect(asked?.text).toMatch(/which repo/i);
    expect(asked?.blocks).toBeUndefined();
  });

  it("starts no run and posts nothing when SLACK_BOT_TOKEN is empty", async () => {
    const queueRun = vi.fn<QueueRun>(async () => ({ approvalId: "appr_1" }));
    const postMessage = vi.fn<PostMessage>(async () => {});
    await handleSlackEvent(mention(), env({ SLACK_BOT_TOKEN: "" }), {
      queueRun,
      fetchThread: async () => [],
    });
    expect(queueRun).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("ignores non-mention events", async () => {
    const queueRun = vi.fn<QueueRun>(async () => ({ approvalId: "appr_1" }));
    await handleSlackEvent(
      { type: "event_callback", event_id: "Ev2", event: { type: "message" } },
      env(),
      { queueRun, postMessage: async () => {} },
    );
    expect(queueRun).not.toHaveBeenCalled();
  });
});
