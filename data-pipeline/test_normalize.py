import unittest
from normalize import normalize_name, staffing_hints


class TestNormalize(unittest.TestCase):
    def test_suffix_variants_match(self):
        keys = {normalize_name(n) for n in
                ["Acme Inc.", "ACME, Incorporated", "Acme LLC", "acme"]}
        self.assertEqual(keys, {"acme"})

    def test_ampersand_and_punctuation(self):
        self.assertEqual(normalize_name("Johnson & Johnson, Inc."), "johnson and johnson")

    def test_accents(self):
        self.assertEqual(normalize_name("Café Société S.A."), "cafe societe s a")

    def test_does_not_strip_middle_words(self):
        # "Company" in the middle is identity, not a suffix
        self.assertEqual(normalize_name("Company Kitchen Inc"), "company kitchen")

    def test_different_companies_stay_different(self):
        self.assertNotEqual(normalize_name("Acme Technologies"), normalize_name("Acme"))

    def test_empty(self):
        self.assertEqual(normalize_name(""), "")
        self.assertEqual(normalize_name(None), "")

    def test_staffing_hints(self):
        self.assertIn("staffing", staffing_hints("Apex Staffing Group LLC"))
        self.assertEqual(staffing_hints("Fresh Bakery Inc"), set())


if __name__ == "__main__":
    unittest.main()
