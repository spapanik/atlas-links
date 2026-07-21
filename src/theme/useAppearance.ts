import { useCallback, useEffect, useState } from 'react';
import { getAppearanceController, type AppearancePreference } from './appearance';

export function useAppearance() {
  const controller = getAppearanceController();
  const [preference, setPreference] = useState(controller.getPreference());

  useEffect(() => controller.subscribe(setPreference), [controller]);

  const selectPreference = useCallback(
    (value: AppearancePreference) => controller.select(value),
    [controller],
  );

  return { preference, selectPreference };
}
