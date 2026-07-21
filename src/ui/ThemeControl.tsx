import type { AppearancePreference } from '../theme/appearance';

export function ThemeControl({
  preference,
  onChange,
}: {
  preference: AppearancePreference;
  onChange: (preference: AppearancePreference) => void;
}) {
  return (
    <label className="theme-control">
      <span>Theme</span>
      <select
        value={preference}
        onChange={(event) => onChange(event.currentTarget.value as AppearancePreference)}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
