import { Children, type ChangeEvent, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ThemeControl } from './ThemeControl';

describe('ThemeControl', () => {
  it('renders an accessible labelled selector with the current preference', () => {
    const markup = renderToStaticMarkup(
      <ThemeControl preference="dark" onChange={() => undefined} />,
    );

    expect(markup).toContain('<label class="theme-control"><span>Theme</span>');
    expect(markup).toContain('<option value="dark" selected="">Dark</option>');
    expect(markup).toContain('<option value="system">System</option>');
  });

  it('reports a newly selected preference', () => {
    let selected = '';
    const control = ThemeControl({
      preference: 'system',
      onChange: (preference) => {
        selected = preference;
      },
    });
    const children = Children.toArray((control.props as { children: ReactNode }).children);
    const select = children[1] as ReactElement<{
      onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
    }>;

    select.props.onChange({ currentTarget: { value: 'dark' } } as ChangeEvent<HTMLSelectElement>);
    expect(selected).toBe('dark');
  });
});
