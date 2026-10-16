// Human confirmation for outward-facing tools, via MCP elicitation. A tool
// argument like `confirm: true` is chosen by the model, so on its own it is
// only advice — a prompt-injected agent can set it. Elicitation asks the
// human directly through the client's UI, outside the model's control.
//
// Returns 'accepted', 'declined', or 'unsupported' (the client did not
// advertise form elicitation; callers fall back to the model-asserted flag
// and say so in their result).

export function makeConfirmWithHuman(mcpServer) {
  return async function confirmWithHuman(message) {
    const caps = mcpServer.server.getClientCapabilities();
    if (!caps?.elicitation?.form) return 'unsupported';
    try {
      const result = await mcpServer.server.elicitInput({
        message,
        requestedSchema: {
          type: 'object',
          properties: {
            confirm: { type: 'boolean', title: 'Yes, go ahead', default: true },
          },
        },
      });
      return result.action === 'accept' && result.content?.confirm !== false ? 'accepted' : 'declined';
    } catch {
      // The client claimed support but the prompt failed — fail closed.
      return 'declined';
    }
  };
}
