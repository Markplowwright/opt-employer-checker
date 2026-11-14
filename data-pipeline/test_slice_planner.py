import unittest

from slice_planner import TooLarge, Unsplittable, plan_exports, DIMENSIONS, US_STATES


def fake_dashboard(sizes, limit):
    """sizes: callable(filters)->row count. Raises TooLarge above `limit`."""
    calls = []

    def export(filters):
        calls.append(dict(filters))
        if sizes(filters) > limit:
            raise TooLarge
        return "slice:" + repr(sorted(filters.items()))

    return export, calls


class PlannerTests(unittest.TestCase):
    def test_small_dataset_is_one_export(self):
        export, calls = fake_dashboard(lambda f: 50_000, limit=100_000)
        res = plan_exports(export)
        self.assertEqual(len(res), 1)
        self.assertEqual(calls, [{}])

    def test_splits_by_state_when_too_large(self):
        # 1.28M total spread evenly across states, limit 100k
        total = 1_280_000

        def sizes(f):
            share = 1 / len(US_STATES) if "state" in f else 1
            return total * share

        export, calls = fake_dashboard(sizes, limit=100_000)
        res = plan_exports(export)
        # whole set rejected once, then one export per state (each ~24k)
        self.assertEqual(len(res), len(US_STATES))
        self.assertEqual(len(calls), 1 + len(US_STATES))

    def test_splits_big_state_further(self):
        def sizes(f):
            if "state" not in f:
                return 1_000_000
            base = 400_000 if f["state"] == "CA" else 10_000
            if "plus" in f:
                base //= 2
            return base

        export, calls = fake_dashboard(sizes, limit=250_000)
        res = plan_exports(export)
        ca = [s for s, _ in res if dict(s.filters).get("state") == "CA"]
        self.assertEqual(len(ca), 2)  # CA split on Opted-in E-Verify+ Yes/No
        others = [s for s, _ in res if dict(s.filters).get("state") not in (None, "CA")]
        self.assertTrue(all(len(s.filters) == 1 for s in others))

    def test_slices_cover_everything_once(self):
        def sizes(f):
            return 1_000_000 if "state" not in f else 1000

        export, _ = fake_dashboard(sizes, limit=5000)
        res = plan_exports(export)
        states = [dict(s.filters)["state"] for s, _ in res]
        self.assertEqual(sorted(states), sorted(US_STATES))
        self.assertEqual(len(states), len(set(states)))

    def test_unsplittable_raises(self):
        export, _ = fake_dashboard(lambda f: 10**9, limit=1)
        with self.assertRaises(Unsplittable):
            plan_exports(export)

    def test_dimension_order(self):
        self.assertEqual([d for d, _ in DIMENSIONS], ["state", "plus", "status"])


if __name__ == "__main__":
    unittest.main()
