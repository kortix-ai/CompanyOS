Connect apps from the chat, checked provider keys, and automations that explain themselves

### New
- Connect Gmail and other apps from the chat: a Connect card appears when the agent needs a sign-in, and the connection finishes by itself when you come back.
- Provider keys are checked when you save them. Models → Providers shows whether the provider accepted each key, with "Check again".
- OpenAI API keys can be added in Models → Providers, next to ChatGPT accounts.

### Improved
- Every LLM provider key lives in one place, the Models panel. Keys saved earlier by other paths move there automatically.
- When a provider refuses a key, the chat says which provider and offers "Open <provider> in Models".
- Saving a key never changes a working default model.
- Automations that cannot run (no model, no credits) pause with the reason and resume by themselves; the trigger page says why a run failed, was skipped or paused.
- An app account shared with an automation's agent is enough for its event trigger; Gmail for an automation asks for one shared sign-in.
- An MCP server that needs a sign-in shows "Sign in", not an error. Unfinished sign-ins show "Finish sign-in".
- A secret you ask the agent to store reaches the agent as an environment variable; you can change a secret's delivery in its Edit dialog.
- A workspace with no usable model says so before a session starts, with Upgrade and Add provider key.
- Subagent reports fold into the "Worked for" step.

### Fixed
- Apps hosted on the old provider rebuild on Platinum instead of failing every hour.
- The trigger composer's model picker opens.
- Requests on your own key no longer ask for more output tokens than the model supports, and Gemini tool calls keep their signatures.
- A setup link that writes a provider key can be used once.
- The workspace split sends no owner email.
