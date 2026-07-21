import { useState, type FormEvent } from 'react';
import type { BookmarkInput } from '../domain/model';

export function BookmarkForm({
  initial,
  tagOptions,
  submitLabel,
  onSubmit,
  onCancel,
  focusName = false,
}: {
  initial: BookmarkInput;
  tagOptions: string[];
  submitLabel: string;
  onSubmit: (input: BookmarkInput) => Promise<void>;
  onCancel?: () => void;
  focusName?: boolean;
}) {
  const [value, setValue] = useState(initial);
  const [tagText, setTagText] = useState(initial.tags.join(', '));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSubmit({ ...value, tags: tagText.split(',') });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save bookmark.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="bookmark-form">
      <label>
        Name
        <input
          autoFocus={focusName}
          required
          value={value.name}
          onChange={(e) => setValue({ ...value, name: e.target.value })}
        />
      </label>
      <label>
        URL
        <input
          required
          type="url"
          value={value.url}
          onChange={(e) => setValue({ ...value, url: e.target.value })}
        />
      </label>
      <label>
        Description <span className="optional">Optional</span>
        <textarea
          rows={3}
          value={value.description}
          onChange={(e) => setValue({ ...value, description: e.target.value })}
        />
      </label>
      <label>
        Tags <span className="optional">Comma separated</span>
        <input
          value={tagText}
          onChange={(e) => setTagText(e.target.value)}
          list="tag-options"
          placeholder="design, reading"
        />
      </label>
      <datalist id="tag-options">
        {tagOptions.map((tag) => (
          <option key={tag} value={tag} />
        ))}
      </datalist>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="form-actions">
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
      </div>
    </form>
  );
}
