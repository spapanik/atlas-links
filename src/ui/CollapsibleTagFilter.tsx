import { useId, useState } from 'react';

export function CollapsibleTagFilter({
  tags,
  selectedTags,
  onToggleTag,
  label,
  className = '',
  showRemoveIndicator = false,
}: {
  tags: string[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  label: string;
  className?: string;
  showRemoveIndicator?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const optionsId = useId();

  return (
    <section className={`tag-filter ${className}`.trim()} aria-label="Filter by tags">
      <span className="tag-filter-label">{label}</span>
      <div className="tag-filter-row">
        <div className={`tag-filter-options${expanded ? ' expanded' : ''}`} id={optionsId}>
          {tags.map((tag) => {
            const active = selectedTags.includes(tag);
            return (
              <button
                key={tag}
                aria-pressed={active}
                className={active ? 'active' : 'secondary'}
                onClick={() => onToggleTag(tag)}
              >
                {tag}
                {active && showRemoveIndicator ? ' ×' : ''}
              </button>
            );
          })}
        </div>
        {!expanded && (
          <span className="tag-filter-ellipsis" aria-hidden="true">
            …
          </span>
        )}
        <button
          type="button"
          className="tag-filter-toggle"
          aria-expanded={expanded}
          aria-controls={optionsId}
          aria-label={expanded ? 'Collapse tags' : 'Show all tags'}
          title={expanded ? 'Collapse tags' : 'Show all tags'}
          onClick={() => setExpanded((current) => !current)}
        >
          <span aria-hidden="true">{expanded ? '▴' : '▾'}</span>
        </button>
      </div>
    </section>
  );
}
