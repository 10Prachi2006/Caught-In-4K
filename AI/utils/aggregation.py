"""
Fuzzy-aware plate aggregation.

Debug crops confirmed the plate crop itself is clean and readable
(e.g. debug_plates/track1_21.jpg). OCR reads it correctly most of the
time but drifts slightly frame-to-frame (3<->J, an occasional dropped
trailing character). The old aggregator only counted EXACT string
matches, so 24 near-identical readings never formed a majority.

Fix: cluster similar strings together (edit-distance based) instead of
requiring an exact match, then within the largest cluster do
per-character majority voting to correct one-off misreads.
"""

from collections import Counter, defaultdict
from rapidfuzz import fuzz


class PlateAggregator:
    def __init__(self, similarity_threshold=85):
        self._readings = defaultdict(list)
        self.similarity_threshold = similarity_threshold

    def add(self, track_id: int, sighting: dict):
        self._readings[track_id].append(sighting)

    def _cluster(self, readings):
        clusters = []
        for r in readings:
            text = r["plate_number"]
            placed = False
            for cluster in clusters:
                if fuzz.ratio(text, cluster["rep"]) >= self.similarity_threshold:
                    cluster["members"].append(r)
                    placed = True
                    break
            if not placed:
                clusters.append({"rep": text, "members": [r]})
        return clusters

    def _consensus_string(self, members):
        lengths = Counter(len(r["plate_number"]) for r in members)
        common_len, _ = lengths.most_common(1)[0]
        same_len = [r for r in members if len(r["plate_number"]) == common_len]

        if len(same_len) <= 1:
            return max(members, key=lambda r: r["combined_confidence"])["plate_number"]

        chars = []
        for i in range(common_len):
            votes = Counter(r["plate_number"][i] for r in same_len)
            chars.append(votes.most_common(1)[0][0])
        return "".join(chars)

    def finalize(self) -> dict:
        results = {}
        for track_id, readings in self._readings.items():
            clusters = self._cluster(readings)
            winning = max(clusters, key=lambda c: len(c["members"]))
            members = winning["members"]

            consensus_plate = self._consensus_string(members)
            best = max(members, key=lambda r: r["combined_confidence"]).copy()
            best["plate_number"] = consensus_plate
            best["vote_count"] = len(members)
            best["total_readings"] = len(readings)
            results[track_id] = best
        return results