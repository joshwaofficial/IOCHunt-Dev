import { create } from 'zustand';
import axios from 'axios';

import { queryClient } from '../App';

let sseSource = null;
let eventBuffer = [];
let uiUpdateTimeout = null;

export const useThreatStore = create((set, get) => ({
  events: [],
  isConnected: false,
  
  // Connect to SSE stream
  connectSSE: (machine = '', range = 168) => {
    // Prevent duplicate connections
    if (sseSource) {
      sseSource.close();
    }

    // Set up SSE connection to the backend
    const url = `/api/stream`;
    sseSource = new EventSource(url, { withCredentials: true });

    sseSource.onopen = () => {
      set({ isConnected: true });
      console.log('[SSE] Connected to threat stream.');
    };

    sseSource.addEventListener('heartbeat', (event) => {
      // Just keep-alive, no action needed
    });

    sseSource.addEventListener('new_event', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data) {
          // 1. Check if the event matches the current machine filter
          if (machine && data.machine !== machine && data.target_machine !== machine && !data.message?.includes(machine)) {
            return; // Skip this event, it's not for the filtered machine
          }

          // 2. Put the new event in the mailbox (buffer array)
          eventBuffer.unshift(data);

          // 2. Start the Throttler timer (if not already running)
          if (!uiUpdateTimeout) {
            uiUpdateTimeout = setTimeout(() => {
              // 3. Time's up! Flush the mailbox to React exactly ONCE
              set((state) => {
                const updatedEvents = [...eventBuffer, ...state.events].slice(0, 500);
                eventBuffer = []; // Empty the mailbox
                return { events: updatedEvents };
              });
              
              // Tell the KPI cards to update too
              queryClient.invalidateQueries({ queryKey: ['stats'] });
              
              uiUpdateTimeout = null;
            }, 1000); // 1-second interval
          }
        }
      } catch (err) {
        console.error('[SSE] Failed to parse new_event:', err);
      }
    });

    sseSource.onerror = (err) => {
      console.error('[SSE] Connection error:', err);
      set({ isConnected: false });
      if (sseSource) {
        sseSource.close();
        sseSource = null;
      }
      
      // Auto-reconnect after 5 seconds
      setTimeout(() => get().connectSSE(machine, range), 5000);
    };
  },

  disconnectSSE: () => {
    if (sseSource) {
      sseSource.close();
      sseSource = null;
      set({ isConnected: false });
      console.log('[SSE] Disconnected.');
    }
  },

  // Initial fetch to populate the buffer
  fetchInitialEvents: async (range, machine) => {
    try {
      const res = await axios.get(`/api/events?limit=500&hours=${range}&machine=${machine}`);
      set({ events: res.data.events || res.data || [] });
    } catch (err) {
      console.error('[Store] Failed to fetch initial events:', err);
    }
  }
}));
