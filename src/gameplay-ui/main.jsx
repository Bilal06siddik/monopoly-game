import React from 'react';
import { createRoot } from 'react-dom/client';
import { GameplayUI } from './GameplayUI';
import './styles.css';

function createEmptySnapshot() {
  return {
    visible: false,
    gameState: null,
    ui: {},
    orientation: {}
  };
}

function createGameplayUIBridge() {
  let container = null;
  let root = null;
  let snapshot = createEmptySnapshot();
  let actions = {};

  function render() {
    if (!root || !container) return;
    root.render(<GameplayUI snapshot={snapshot} actions={actions} />);
  }

  return {
    mount(nextContainer, nextActions = {}) {
      if (!nextContainer) return;
      if (root && container !== nextContainer) {
        root.unmount();
        root = null;
      }
      container = nextContainer;
      actions = nextActions;
      if (!root) {
        root = createRoot(container);
      }
      render();
    },
    update(nextSnapshot) {
      snapshot = nextSnapshot || createEmptySnapshot();
      render();
    },
    destroy() {
      if (root) {
        root.unmount();
        root = null;
      }
      if (container) {
        container.innerHTML = '';
      }
      container = null;
      snapshot = createEmptySnapshot();
      actions = {};
    }
  };
}

window.GameplayUIBridge = createGameplayUIBridge();
