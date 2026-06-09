let state = {
  hubOrders: [],
  lastLoadedAt: null,
  loading: false
};

const listeners = new Set();

export const hubActivityStore = {
  getState() {
    return state;
  },
  setState(nextState) {
    state = { ...state, ...nextState };
    listeners.forEach((listener) => listener(state));
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  refresh: null,
  async triggerRefresh() {
    if (typeof this.refresh === "function") {
      this.setState({ loading: true });
      try {
        await this.refresh();
      } finally {
        this.setState({ loading: false });
      }
    }
  }
};
