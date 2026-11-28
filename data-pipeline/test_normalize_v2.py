"""Tests for rule E (normalize_v2). Run with pytest. The vectors file is shared with the JavaScript tests."""
import json
import os
import unittest

from normalize_v2 import canon_key, drop_us, strict_key

VECTORS = os.path.join(os.path.dirname(__file__), "..", "extension", "test", "vectors2.json")


class RuleE(unittest.TestCase):
    def test_shared_vectors(self):
        with open(VECTORS, encoding="utf-8") as f:
            vectors = json.load(f)
        self.assertGreaterEqual(len(vectors), 3000)
        for name, loose, strict in vectors:
            self.assertEqual(canon_key(name), loose, name)
            self.assertEqual(strict_key(name), strict, name)

    def test_keep_apart_and_join(self):
        self.assertNotEqual(canon_key("S&P Global"), canon_key("SP Global, Inc."))
        self.assertNotEqual(canon_key("P&G Hospitality Inc"), canon_key("PG Hospitality, LLC"))
        self.assertNotEqual(canon_key("Clark"), canon_key("Clark & Company LLC"))
        self.assertEqual(canon_key("IBM"), canon_key("IBM Corp"))
        self.assertEqual(canon_key("Morrison Foerster"), canon_key("Morrison & Foerster LLP"))
        self.assertEqual(canon_key("The Dermatology Specialists"), canon_key("Dermatology Specialists, LLC"))

    def test_letter_table(self):
        for a, b in [("Ørsted Inc", "orsted"), ("Straße GmbH", "strasse gmbh"), ("Łódź Inc", "lodz"), ("Æon Inc", "aeon")]:
            self.assertEqual(canon_key(a), b)

    def test_dots(self):
        self.assertEqual(canon_key("Kingswood U.S."), canon_key("KINGSWOOD US, LLC"))
        self.assertNotEqual(strict_key("Kingswood U.S."), strict_key("KINGSWOOD US, LLC"))
        self.assertEqual(strict_key("Point72 L.P."), strict_key("Point72"))
        self.assertEqual(canon_key("B.H.I. Inc"), "bhi")

    def test_trailing_ids_and_endings(self):
        self.assertEqual(canon_key("Acme 1234567"), "acme")
        self.assertEqual(canon_key("Acme 12345 LLC"), "acme")
        self.assertEqual(canon_key("Acme 1234"), "acme 1234")
        self.assertEqual(canon_key("The Inc"), "inc")   # edge case: leading "the" goes first, then the last remaining word is never stripped

    def test_non_latin_is_empty(self):
        for n in ["株式会社ソニー", "Яндекс", "شركة النفط", "", "   "]:
            self.assertEqual(canon_key(n), "")

    def test_drop_us(self):
        self.assertEqual(drop_us("bank of china usa"), "bank of china")
        self.assertEqual(drop_us("kpmg us"), "kpmg")
        self.assertIsNone(drop_us("us"))
        self.assertIsNone(drop_us("us bank"))


if __name__ == "__main__":
    unittest.main()
