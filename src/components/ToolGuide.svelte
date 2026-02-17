<script>
  let { tabs = [] } = $props();

  let activeTab = $state(0);
  let collapsed = $state(false);
</script>

<div class="guide" class:collapsed>
  <div class="guide-header">
    <div class="tabs">
      {#each tabs as tab, i}
        <button
          class="tab"
          class:active={activeTab === i}
          onclick={() => { activeTab = i; if (collapsed) collapsed = false; }}
        >
          {tab.label}
        </button>
      {/each}
    </div>
    <button class="toggle" onclick={() => collapsed = !collapsed} aria-label={collapsed ? 'Ouvrir le guide' : 'Fermer le guide'}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d={collapsed ? 'M4 6l4 4 4-4' : 'M4 10l4-4 4 4'} stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
  </div>
  {#if !collapsed}
    <div class="guide-body">
      {#each tabs as tab, i}
        {#if activeTab === i}
          <div class="tab-content">
            {@html tab.content}
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .guide {
    border: 1px solid var(--border, #E0E0E0);
    border-radius: 8px;
    background: #fff;
    overflow: hidden;
  }

  .guide-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--border, #E0E0E0);
    background: var(--bg-warm, #EFEFE6);
  }

  .collapsed .guide-header {
    border-bottom: none;
  }

  .tabs {
    display: flex;
    gap: 0;
  }

  .tab {
    font-family: var(--sans, system-ui, sans-serif);
    font-size: 0.78rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    padding: 0.85rem 1.25rem;
    border: none;
    background: none;
    color: var(--text-soft, #555);
    cursor: pointer;
    position: relative;
    transition: color 0.2s;
  }

  .tab:hover {
    color: var(--text, #111);
  }

  .tab.active {
    color: var(--text, #111);
  }

  .tab.active::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 1rem;
    right: 1rem;
    height: 2px;
    background: var(--blue, #1A5CFF);
    border-radius: 2px 2px 0 0;
  }

  .collapsed .tab.active::after {
    display: none;
  }

  .toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    margin-right: 0.5rem;
    border: none;
    background: none;
    color: var(--text-soft, #555);
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.2s;
  }

  .toggle:hover {
    background: rgba(0,0,0,0.05);
    color: var(--text, #111);
  }

  .guide-body {
    padding: 1.25rem 1.5rem;
  }

  .tab-content {
    font-size: 0.9rem;
    line-height: 1.7;
    color: var(--text, #111);
  }

  .tab-content :global(ol) {
    padding-left: 0;
    counter-reset: step;
    list-style: none;
  }

  .tab-content :global(ol li) {
    counter-increment: step;
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
    margin-bottom: 0.75rem;
  }

  .tab-content :global(ol li::before) {
    content: counter(step);
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--text, #111);
    color: #fff;
    font-size: 0.72rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 0.1rem;
  }

  .tab-content :global(strong) {
    font-weight: 600;
  }

  .tab-content :global(ul) {
    padding-left: 1.25rem;
    margin-top: 0.4rem;
  }

  .tab-content :global(ul li) {
    margin-bottom: 0.3rem;
    list-style: disc;
  }

  .tab-content :global(ul li::before) {
    display: none;
  }

  .tab-content :global(kbd) {
    display: inline-block;
    padding: 0.1rem 0.45rem;
    border: 1px solid var(--border, #E0E0E0);
    border-radius: 3px;
    background: var(--bg-warm, #EFEFE6);
    font-family: monospace;
    font-size: 0.82rem;
  }

  @media (max-width: 640px) {
    .tab {
      font-size: 0.72rem;
      padding: 0.75rem 0.85rem;
    }

    .guide-body {
      padding: 1rem;
    }
  }
</style>
