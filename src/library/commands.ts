export type ExtensionCommand = {
  name?: string;
  shortcut?: string;
};

export function shortcutLabel(commands: ExtensionCommand[], name: string) {
  return commands.find((command) => command.name === name)?.shortcut?.trim() || 'Unassigned';
}
