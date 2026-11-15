import gzip, json, os, tempfile
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
    assert cog["years"]["2023"] == {"ia": 1205, "id": 10, "ca": 3007, "cd": 20, "oa": 0, "od": 0}
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
        assert main([o, "--from-dir", d, "--manual-dir", d + "/none"]) == 0
        meta = json.load(open(os.path.join(o, "h1b_meta.json")))
        assert meta["years_fetched"] == [2023] and 2024 in meta["years_missing"] and 2009 in meta["years_missing"]


CSV_FY24 = ("Line by line,Fiscal Year   ,Employer (Petitioner) Name,Tax ID,Industry (NAICS) Code,Petitioner City,Petitioner State,Petitioner Zip Code,"
            "New Employment Approval,New Employment Denial,Continuation Approval,Continuation Denial,Change with Same Employer Approval,"
            "Change with Same Employer Denial,New Concurrent Approval,New Concurrent Denial,Change of Employer Approval,Change of Employer Denial,"
            "Amended Approval,Amended Denial\n"
            "1,2024,ACME CORP,1234,54,DALLAS,TX,75001,5,1,7,2,1,0,2,0,3,1,4,0\n"
            "2,2024,,,,,,,1,0,0,0,0,0,0,0,0,0,0,0\n")


def test_fy2024_format_sums_other_types_and_skips_blank_names():
    recs = parse_csv(CSV_FY24.encode(), 2024)
    assert len(recs) == 1  # blank-name row skipped
    r = recs[0]
    assert (r["ia"], r["id"], r["ca"], r["cd"]) == (5, 1, 7, 2)
    assert r["oa"] == 1 + 2 + 3 + 4 and r["od"] == 1 and r["state"] == "TX" and r["fy"] == 2024


def test_manual_gz_file_is_used():
    with tempfile.TemporaryDirectory() as d, tempfile.TemporaryDirectory() as o:
        with gzip.open(os.path.join(d, "h1b_datahubexport-2024.csv.gz"), "wb") as f:
            f.write(CSV_FY24.encode())
        assert main([o, "--from-dir", d, "--manual-dir", d]) == 0
        meta = json.load(open(os.path.join(o, "h1b_meta.json")))
        assert meta["years_fetched"] == [2024] and meta["years_manual"] == [2024]
        idx = json.load(open(os.path.join(o, "h1b.json")))
        assert idx["acme"]["years"]["2024"]["oa"] == 10
