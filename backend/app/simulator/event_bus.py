"""In-memory pub/sub event bus.

Zero-config replacement for MQTT broker. Routes telemetry, commands,
and DTC events between simulator, ingestion, and agent components.
"""

import asyncio
from collections import defaultdict
from typing import Callable, Awaitable

EventHandler = Callable[[str, dict], Awaitable[None]]


class EventBus:
    """Simple async topic-based pub/sub event bus."""

    def __init__(self):
        self._subscribers: dict[str, list[EventHandler]] = defaultdict(list)
        self._running = False

    async def start(self):
        self._running = True

    async def stop(self):
        self._running = False
        self._subscribers.clear()

    def subscribe(self, topic: str, handler: EventHandler):
        """Subscribe handler to topic. Topic may use + wildcard for one segment."""
        self._subscribers[topic].append(handler)

    def unsubscribe(self, topic: str, handler: EventHandler):
        try:
            self._subscribers[topic].remove(handler)
        except ValueError:
            pass

    async def publish(self, topic: str, payload: dict):
        """Publish payload to all subscribers matching the topic."""
        if not self._running:
            return
        tasks = []
        for pattern, handlers in self._subscribers.items():
            if self._topic_matches(pattern, topic):
                for h in handlers:
                    tasks.append(h(topic, payload))
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    @staticmethod
    def _topic_matches(pattern: str, topic: str) -> bool:
        """Match MQTT-style topic pattern (supports + wildcard)."""
        pattern_parts = pattern.split("/")
        topic_parts = topic.split("/")
        if len(pattern_parts) != len(topic_parts):
            return False
        for pp, tp in zip(pattern_parts, topic_parts):
            if pp != "+" and pp != tp:
                return False
        return True


# Singleton event bus
event_bus = EventBus()
