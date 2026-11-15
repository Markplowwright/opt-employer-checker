import json, os, tempfile
from fetch_h1b import parse_csv, build, main

CSV_NEW = ("Fiscal Year,Employer,Initial Approval,Initial Denial,Continuing Approval,Continuing Denial,NAICS,Tax ID,State,City,ZIP\n"
           '2023,"COGNIZANT TECHNOLOGY SOLUTIONS US CORP","1,200",10,3000,20,541511,1234,NJ,TEANECK,07666\n'
           "2023,COGNIZANT TECHNOLOGY SOLUTIONS US CORP.,5,0,7,0,541511,1234,TX,DALLAS,75001\n"
           "2023,Tiny Shop LLC,0,1,0,0,541511,9999,NY,BROOKLYN,11201\n")
CSV_OLD = "Fiscal Year\tEmployer (Petitioner) Name\tInitial Approvals\tInitial Denials\tContinuing Approvals\tContinuing Denials\n2015\tAcme Inc\t4\t0\t2\t1\n"


def test_parse_and_merge():
    recs = parse_csv(CSV_NEW.encode(), 2023)
    assert recs[0]["ia"] == 1200 and recs[2]["id"] == 1
    idx = build(recs)
    cog = idx["cognizant technology solutions us"]
    assert cog["years"]["2023"] == {"ia": 1205, "id": 10, "ca": 3007, "cd": 20}
    assert cog["states"] == ["NJ", "TX"]


def test_old_tab_utf16():
    recs = parse_csv(CSV_OLD.encode("utf-16"), 2015)
    assert recs[0]["name"] == "Acme Inc" and recs[0]["cd"] == 1


def test_unknown_columns_raise():
    try:
        parse_csv(b"a,b,c\n1,2,3\n", 2020)
        assert False
    except ValueError:
        pass


def test_missing_years_reported():
    with tempfile.TemporaryDirectory() as d, tempfile.TemporaryDirectory() as o:
        open(os.path.join(d, "h1b_datahubexport-2023.csv"), "wb").write(CSV_NEW.encode())
        assert main([o, "--from-dir", d]) == 0
        meta = json.load(open(os.path.join(o, "h1b_meta.json")))
        assert meta["years_fetched"] == [2023] and 2024 in meta["years_missing"] and 2009 in meta["years_missing"]
