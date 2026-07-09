#!/usr/bin/env python3
"""Canonical FCS materials catalog, transcribed from the scanned warehouse
order sheets (Pictures For FCS OS/IMG_1161-1166.jpeg).

Ordering follows the printed sheets. Spelling-only normalizations from the
originals (e.g. "Tivex" -> "Tyvek", "Grid Sandpaper" -> "Grit Sandpaper",
"Xelen" -> "Xylene", "Drop Clothes" -> "Drop Cloths", "C clams" -> "C Clamps",
"Paper tower" -> "Paper Towels", "Mill" -> "Mil") are listed in
TRANSCRIPTION_NOTES below. No items were added or removed.

Run: python3 catalog.py > 002_seed_materials.sql
"""

# (name, detail) tuples; detail is an operational note printed on the sheet.
LEAD_MATERIALS = [
    # --- Lead Order List, page 1 (IMG_1161) ---
    ("6 Mil Plastic Rolls", None),
    ("Green Spring Clamps", None),
    ("Tyvek Suits", None),
    ('Bent Scrapers 3"', None),
    ("Red Lead Tape", None),
    ("Yellow Caution Tape", None),
    ("Organic Cartridges", None),
    ("Pallets", None),
    ("3 Empty Drums", None),
    ("Spray Glue", None),
    ("Air Monitors", None),
    ("Lead Cassettes", None),
    ("Duct Tape", None),
    ("1 Gal Zip Lock Bags", None),
    ("Latex Gloves", None),
    ("Hudson Sprayer", None),
    ("HEPA Vac", None),
    ("Extension Cord", None),
    ("GFI Three Way", None),
    ("Drum Labels", None),
    ("Eye Wash", None),
    ("Particulate Cartridges", None),
    ("Yellow Lead Sign", None),
    ("Socket Wrench", None),
    ("First Aid Kit", None),
    ("Lead Plan", None),
    ("Whip Hoses", None),
    # --- Lead Order List, page 2 (IMG_1162) ---
    ("Needle Gun", None),
    ("Needles", None),
    ("WD-40", None),
    ("Chicago Hoses", None),
    ("Lead Wipes", None),
    ("Garbage Bags", None),
    ("Safety Glasses", None),
    ("Boxes of Knives", None),
    ("Extension Poles 4-8 Ft", None),
    ("Extension Poles 6-12 Ft", None),
    ("Harness", None),
    ("Lanyard", None),
    ("Beam Clamps", None),
    ("Pipe Wraps", None),
    ("Retractable", None),
    ("Lead Cards - For Men", None),
    ("Adapters for Respirators", None),
    ("Hand Sanitizer", None),
    ("Paper Towels", None),
    ("Portable Light", None),
    ("Ear Plugs", None),
    ("Empty Buckets 5 Gal", None),
    ("Empty Buckets 2 Gal", None),
    ("C Clamps", None),
    ("Rope", None),
    ("Haz-Mat Sign", None),
    ("Locks", None),
    ("Chain", None),
]

LEAD_PAPERWORK_SIGNS = [
    # --- "Paper work & Signs needed for a Lead job" (IMG_1163) ---
    ("Drum Tracking Log", "With plastic cover"),
    ("Lead Plan", "EPA ID # · Placard (MTA job only)"),
    ("Chain of Custody Forms", None),
    ("Lead MSDS", None),
    ("Emergency Phone Numbers", "Posted inside & outside of the Conex box"),
    ("FedEx Bags (Large)", None),
    ("FedEx Labels", None),
    ("FedEx Plastic Label Holders", None),
    ("No Smoking Signs", "2 required"),
    ("Warning Hazardous Material Storage Area Signs", "2 required"),
    ("Caution Lead Hazard Area Signs", "2 required"),
    ("Air Horn", None),
    ("Cell Phone", None),
    ("Hazardous Waste Labels", None),
    ("Non-Hazardous Labels", None),
    ("Hazardous Waste Pending Analysis Forms",
     "Kept on each drum before TCLP — DEP jobs only"),
]

PAINTING_MATERIALS = [
    # --- Painting Order List, page 1 (IMG_1164) ---
    ('7" Handles', None),
    ('9" Handles', None),
    ('4" Handles', None),
    ('2" Hook Brushes', None),
    ('3" Hook Brushes', None),
    ("5 Gallon Buckets", None),
    ("2 Gallon Buckets", None),
    ("Drop Cloths", None),
    ("4-8 Ft Poles", None),
    ("6-12 Ft Poles", None),
    ("8-16 Ft Poles", None),
    ("5 Gal Bucket Grids", None),
    ("2 Gal Bucket Grids", None),
    ("Latex Brushes", None),
    ('2.5" Oil Latex Brushes', None),
    ("Organic Filters", None),
    ("Mixing Wands", None),
    ("Mixing Drill", None),
    ("GFI Three Way", None),
    ("Spray Machine", None),
    ("Xylene", None),
    ("MEK", None),
    ("Rags", None),
    ("Garbage Bags", None),
    ("2 Mil Plastic", None),
    ("Wood Sticks", None),
    ("Strainer Bag", None),
    # --- Painting Order List, page 2 (IMG_1165) ---
    ("Duct Tape", None),
    ("Blue Tape", None),
    ("First Aid Kit", None),
    ("Latex Gloves", None),
    ("Hand Cleaner", None),
    ("Spray Hoods", None),
    ("Harnesses", None),
    ("Lanyard", None),
    ("Pipe Wrap", None),
    ("Beam Clamp", None),
    ("11 Ft Retractable", None),
    ("30 Ft Retractable", None),
    ("80 Grit Sandpaper", None),
    ("100 Grit Sandpaper", None),
    ("Wire Brush", None),
    ("Sleeves", None),
    ("Safety Glasses", None),
    ("Safety Vest", None),
    ("Wizz Handles", None),
    ("Wizz Sleeves", None),
    ('4" Sleeves', None),
    ('4" Sleeves ¼ Nap', None),
    ('4" Sleeves ½ Nap', None),
    ('4" Sleeves ¾ Nap', None),
    ("MSDS Product Data", None),
    ("Lead Filters", None),
    ("Mineral Spirits", None),
    ("Chip Brushes", None),
    # --- Painting Order List, page 3 (IMG_1166) ---
    ("Paper Towels", None),
    ("Scrapers", None),
    ("Hammers", None),
    ("Blue Gloves", None),
    # Page 3 also has a blank "Misc:" section — covered in the app by
    # free-form custom line items on the order form.
]

TRANSCRIPTION_NOTES = {
    "Tyvek Suits": "printed 'Tivex Suits'",
    "6 Mil Plastic Rolls": "printed '6 Mill Plastic Rolls'",
    "2 Mil Plastic": "printed '2 Mill Plastic'",
    "Drop Cloths": "printed 'Drop Clothes'",
    "Xylene": "printed 'Xelen'",
    "C Clamps": "printed 'C clams'",
    "Haz-Mat Sign": "printed 'Hazd-Mat Sign'",
    "Paper Towels": "printed 'Paper tower'",
    "80 Grit Sandpaper": "printed '80 Grid Sandpaper'",
    "100 Grit Sandpaper": "printed '100 Grid Sandpaper'",
    "HEPA Vac": "printed 'Hepa-VAC'",
    "WD-40": "printed 'WD40'",
    "1 Gal Zip Lock Bags": "printed '1 Gal. Zip Lock Bag'",
    "Chain of Custody Forms": "printed \"Chain of Custody's\"",
}


def sql_str(value):
    if value is None:
        return "null"
    return "'" + value.replace("'", "''") + "'"


def main():
    rows = []
    for i, (name, detail) in enumerate(LEAD_MATERIALS):
        rows.append(("lead", "materials", name, detail, i + 1))
    for i, (name, detail) in enumerate(LEAD_PAPERWORK_SIGNS):
        rows.append(("lead", "paperwork_signs", name, detail, i + 1))
    for i, (name, detail) in enumerate(PAINTING_MATERIALS):
        rows.append(("painting", "materials", name, detail, i + 1))

    print("-- Generated by catalog.py — do not edit by hand.")
    print("insert into public.materials (list, grp, name, detail, sort_order) values")
    values = ",\n".join(
        f"  ({sql_str(l)}, {sql_str(g)}, {sql_str(n)}, {sql_str(d)}, {o})"
        for (l, g, n, d, o) in rows
    )
    print(values + ";")
    print(f"-- total rows: {len(rows)}")


if __name__ == "__main__":
    main()
