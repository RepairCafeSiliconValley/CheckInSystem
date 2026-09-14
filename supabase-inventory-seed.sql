-- ============================================
-- Repair Cafe Check-In — Supply Inventory Seed
-- ============================================
-- Run in the Supabase SQL Editor (Dashboard → SQL Editor → New Query).
-- Prerequisite: supabase-migration-v9.sql already run.
--
-- Loads the trailer's supply index as it stood on the printed sheet.
-- 229 items across 34 bins.
--
-- Unlike supabase-seed.sql this TRUNCATES NOTHING and is safe on prod — it is
-- plain inserts with ON CONFLICT DO NOTHING against inventory_items_name_bin_idx,
-- so re-running it adds nothing and overwrites nothing. Edits made in the
-- Supplies tab after the first run therefore survive a re-run: a row deleted in
-- the app WILL come back if this is run again, but a row that was renamed or
-- re-binned is left alone.
--
-- Three transformations were applied to the paper index. Rules A and C are
-- listed with each bin below; every line Rule B dropped is listed in full at
-- the bottom of this file so nothing is invisible.
--
--   A. Bin headings became items. A bin whose heading was all the information
--      it carried ("$ B3 Power Strips") had no searchable row at all, so the
--      heading itself is now the item. The bin nicknames written on the bike
--      bins ("Bike 1".."Bike 4") are items for the same reason.
--   B. Comma-inversions collapsed. The paper index carried each item twice
--      ("Gloves, nitrile" AND "Nitrile gloves") because paper cannot be
--      searched; the page has a search box, so only the natural form is kept.
--      Genuine synonyms (Q-tips / Cotton swabs) are NOT inversions and both
--      stay.
--   C. The one item not in a bin ("Bar clamps {in Trailer; back right of E6}")
--      is in a pseudo-bin named TRAILER.
--
-- Casing is normalised to sentence case — the sheet mixed "Long Power Cords"
-- with "Bike tools" — except brand names (WD-40, Shoe Goo, Kill-A-Watt) and
-- acronyms (HDMI, VCR, AC, DC).

INSERT INTO inventory_items (name, bin) VALUES
  -- ─── A1 · First aid, gloves, ziploc bags, Q-tips, safety glasses, masks ───
  ('First aid kit',              'A1'),   -- also in D1, which is intentional
  ('Band aids',                  'A1'),
  ('Ziploc bags',                'A1'),
  ('Q-tips',                     'A1'),
  ('Cotton swabs',               'A1'),   -- synonym of Q-tips, kept
  ('Cotton balls',               'A1'),
  ('Cotton pads',                'A1'),
  ('Gloves',                     'A1'),
  ('Nitrile gloves',             'A1'),
  ('Rubber gloves',              'A1'),
  ('Latex gloves',               'A1'),
  ('Leather gloves',             'A1'),
  ('Work gloves',                'A1'),
  ('Gardening gloves',           'A1'),   -- sheet read "Glover, gardening" (typo)
  ('Safety glasses',             'A1'),
  ('Surgical masks',             'A1'),
  ('Flashlights',                'A1'),

  -- ─── A2 · Bike tools, brakes, cables (Bike 1) ───
  ('Bike 1',                     'A2'),   -- rule A: the name written on the bin
  ('Bike tools',                 'A2'),
  ('Bike cables',                'A2'),
  ('Brake parts',                'A2'),

  -- ─── A3 · Bike parts (Bike 2) ───
  ('Bike 2',                     'A3'),   -- rule A
  ('Bike parts',                 'A3'),
  ('Bike crank',                 'A3'),

  -- ─── A4 · Bike parts (Bike 3) ───
  ('Bike 3',                     'A4'),   -- rule A
  ('Bike pedals',                'A4'),
  ('Bike stems',                 'A4'),
  ('Bike kickstand',             'A4'),
  ('Bike training wheels',       'A4'),
  ('Bike handbook',              'A4'),
  ('Bike wheel truing jig',      'A4'),
  ('Bike cassette',              'A4'),

  -- ─── A5 · Bike tubes (Bike 4) ───
  ('Bike 4',                     'A5'),   -- rule A
  ('Bike tubes',                 'A5'),

  -- ─── A6 · Spare ───
  ('Spare',                      'A6'),   -- rule A: empty bin, kept so it is findable

  -- ─── B1 · Plates, tablecloths, napkins ───
  ('Plates',                     'B1'),   -- rule A: heading split on commas
  ('Tablecloths',                'B1'),   -- rule A
  ('Napkins',                    'B1'),   -- rule A

  -- ─── B2 · Donor cables, test cables, test audio ───
  ('Donor cables',               'B2'),   -- rule A: heading term with no entry
  ('Test cables',                'B2'),   -- rule A: replaces the see-also line
  ('Test audio',                 'B2'),   -- rule A
  ('Two conductor cable',        'B2'),
  ('Three conductor cable',      'B2'),
  ('Audio cable',                'B2'),
  ('Stereo cable',               'B2'),
  ('Video cable',                'B2'),   -- sheet had only "Cable, video"
  ('HDMI cable',                 'B2'),
  ('C7 cable',                   'B2'),
  ('C7P cable (polarized)',      'B2'),
  ('C13 cable (PC)',             'B2'),
  ('Test CD',                    'B2'),
  ('Test cassette',              'B2'),

  -- ─── B3 · Power strips ───
  ('Power strips',               'B3'),   -- rule A

  -- ─── B4/B5/B6 · Sewing boxes ───
  ('Sewing box C',               'B4'),   -- rule A
  ('Sewing box B',               'B5'),   -- rule A
  ('Sewing box A',               'B6'),   -- rule A

  -- ─── C1 · Long power cords ───
  ('Long power cords',           'C1'),
  ('Extension cords',            'C1'),

  -- ─── C2 · Fasteners ───
  ('Fasteners',                  'C2'),
  ('Metric fasteners',           'C2'),
  ('Imperial fasteners',         'C2'),
  ('Nails',                      'C2'),
  ('Screws',                     'C2'),
  ('Wood screws',                'C2'),
  ('Sheet metal screws',         'C2'),
  ('Machine screws',             'C2'),
  ('Washers',                    'C2'),
  ('Nuts',                       'C2'),
  ('Bolts',                      'C2'),

  -- ─── C3 · DC transformers ───
  ('DC transformers',            'C3'),
  ('Wall warts',                 'C3'),
  ('Power bricks',               'C3'),

  -- ─── C4 · Pliers, cutters, strippers, hammers, razors, scissors ───
  ('Pliers',                     'C4'),
  ('Nut drivers',                'C4'),
  ('Diagonal cutters',           'C4'),
  ('Wire cutters',               'C4'),
  ('Strippers',                  'C4'),
  ('Hammer',                     'C4'),
  ('Mallet',                     'C4'),
  ('Sockets',                    'C4'),
  ('Allen keys',                 'C4'),
  ('Hex keys',                   'C4'),   -- synonym of Allen keys, kept
  ('Scissors',                   'C4'),
  ('Razor',                      'C4'),
  ('Box cutter',                 'C4'),
  ('Awls',                       'C4'),
  ('Tape measure',               'C4'),
  ('Crescent wrench',            'C4'),
  ('Files',                      'C4'),
  ('Small files',                'C4'),
  ('Stapler',                    'C4'),
  ('Staples',                    'C4'),
  ('Punch set',                  'C4'),

  -- ─── C5 · Drills, Dremel, heat gun ───
  ('Drill',                      'C5'),
  ('Power drill',                'C5'),
  ('Drill bits',                 'C5'),
  ('Driver',                     'C5'),
  ('Dremel',                     'C5'),
  ('Heat gun',                   'C5'),

  -- ─── C6 · Screwdrivers, iFixit kits, drive bits ───
  ('Screwdrivers',               'C6'),
  ('iFixit kits',                'C6'),
  ('Drive bits',                 'C6'),
  ('Precision drive bits',       'C6'),
  ('Drive handles',              'C6'),
  ('Hex bits',                   'C6'),
  ('Torx bits',                  'C6'),
  ('Pozi bits',                  'C6'),
  ('Security bits',              'C6'),
  ('Spudgers',                   'C6'),
  ('Suction cups',               'C6'),
  ('Watch openers',              'C6'),

  -- ─── D1 · Check-in desk ───
  ('Check-in desk',              'D1'),   -- rule A: heading term with no entry
  ('Scale',                      'D1'),
  ('First aid kit',              'D1'),   -- also in A1, which is intentional
  ('Tip jars',                   'D1'),

  -- ─── D2 · Jewelry ───
  ('Jewelry',                    'D2'),   -- rule A

  -- ─── D3 · Batteries ───
  ('Batteries',                  'D3'),
  ('Coin cell batteries',        'D3'),

  -- ─── D4 · Soldering ───
  ('Solder',                     'D4'),
  ('Solder kits',                'D4'),
  ('Soldering irons',            'D4'),
  ('Solder flux',                'D4'),
  ('Solder wick',                'D4'),
  ('Solder fume extractor',      'D4'),
  ('Solder sucker',              'D4'),
  ('Desoldering pump',           'D4'),   -- synonym of solder sucker, kept

  -- ─── D5 · Clamps, Panavise ───
  ('Clamps',                     'D5'),
  ('Panavise',                   'D5'),

  -- ─── D6 · Coffee and bagel supplies ───
  ('Coffee and bagel supplies',  'D6'),   -- rule A

  -- ─── E1 · Tape, zip ties, string, steel wire, sandpaper, dowels ───
  ('Tape',                       'E1'),
  ('Gaffer tape',                'E1'),
  ('Masking tape',               'E1'),
  ('Double sided tape',          'E1'),
  ('Electrical tape',            'E1'),
  ('Packing tape',               'E1'),
  ('Scotch tape',                'E1'),
  ('Teflon tape',                'E1'),
  ('Phone sealing tape',         'E1'),
  ('Painter''s tape',            'E1'),
  ('Zip ties',                   'E1'),
  ('Dowels',                     'E1'),
  ('Sandpaper',                  'E1'),
  ('String',                     'E1'),
  ('Metal wire',                 'E1'),
  ('Steel wire',                 'E1'),
  ('Steel wool',                 'E1'),

  -- ─── E2 · Fuses, connectors, copper wire ───
  ('Glass fuses',                'E2'),
  ('Thermal fuses',              'E2'),
  ('Auto fuses',                 'E2'),
  ('Blade fuses',                'E2'),
  ('Shrink tube',                'E2'),
  ('Wire connectors',            'E2'),
  ('Wire splices',               'E2'),
  ('Wire nuts',                  'E2'),
  ('Thermal wire nuts',          'E2'),
  ('Ceramic wire nuts',          'E2'),
  ('Butt connectors',            'E2'),
  ('Hookup wire',                'E2'),
  ('Copper wire',                'E2'),
  ('Thermal wire',               'E2'),
  ('Thermal wire insulation',    'E2'),
  ('Triac kit',                  'E2'),
  ('Electrolytic capacitor kit', 'E2'),

  -- ─── E3 · Lamp parts, light bulbs, appliance parts, plugs, switches ───
  ('Appliance parts',            'E3'),   -- rule A: heading term with no entry
  ('Lamp parts',                 'E3'),
  ('Lamp sockets',               'E3'),
  ('Lamp switches',              'E3'),
  ('Lamp test bulbs',            'E3'),
  ('Test bulbs',                 'E3'),
  ('Light bulbs',                'E3'),
  ('Plugs',                      'E3'),
  ('Switches',                   'E3'),
  ('Casters',                    'E3'),
  ('VCR belts',                  'E3'),
  ('Clock parts',                'E3'),
  ('Clock movements',            'E3'),
  ('Clock hands',                'E3'),
  ('Eyeglass kit',               'E3'),

  -- ─── E4 · Multimeters, variable power supplies, Kill-A-Watt ───
  ('Multimeters',                'E4'),
  ('AC voltage detector',        'E4'),
  ('Contactless AC voltage detector', 'E4'),
  ('AC current clamp',           'E4'),
  ('Kill-A-Watt',                'E4'),
  ('Power monitor',              'E4'),
  ('Calipers',                   'E4'),
  ('Variable power supply',      'E4'),

  -- ─── E5 · Desk lamps ───
  ('Desk lamps',                 'E5'),   -- rule A

  -- ─── E6 · Stanchion toppers ───
  ('Stanchion toppers',          'E6'),   -- rule A

  -- ─── F4 · Lubricants ───
  ('Lubricants',                 'F4'),
  ('Teflon lube',                'F4'),
  ('Dielectric grease',          'F4'),
  ('Thermal grease',             'F4'),
  ('Food safe grease',           'F4'),
  ('Grease',                     'F4'),
  ('Liquid Wrench',              'F4'),
  ('WD-40',                      'F4'),
  ('Oil',                        'F4'),
  ('Shredder oil',               'F4'),
  ('Sewing machine oil',         'F4'),
  ('3 in 1 oil',                 'F4'),

  -- ─── F5 · Glues ───
  ('Glue',                       'F5'),
  ('Wood glue',                  'F5'),
  ('Super glue',                 'F5'),
  ('Glue gun',                   'F5'),
  ('Glue sticks',                'F5'),
  ('Epoxy',                      'F5'),
  ('E6000',                      'F5'),
  ('Shoe Goo',                   'F5'),
  ('Spray adhesive',             'F5'),
  ('Fabric adhesive',            'F5'),
  ('Rubber cement',              'F5'),
  ('Loctite (thread locker)',    'F5'),
  ('Liquid electrical tape',     'F5'),

  -- ─── F6 · Cleaning supplies ───
  ('Cleaning supplies',          'F6'),   -- rule A: heading term with no entry
  ('Isopropyl alcohol',          'F6'),
  ('Vinegar',                    'F6'),
  ('Acetone',                    'F6'),
  ('Baking soda',                'F6'),
  ('Sanitary spray',             'F6'),
  ('Wipes',                      'F6'),
  ('Whiteboard cleaner',         'F6'),
  ('Contact cleaner',            'F6'),
  ('Goo-gone',                   'F6'),
  ('Magic eraser',               'F6'),
  ('Pipe cleaners',              'F6'),
  ('Brushes',                    'F6'),
  ('Tongue depressors',          'F6'),
  ('Syringes',                   'F6'),

  -- ─── TRAILER · loose, not in a bin ───
  ('Bar clamps (back right of E6)', 'TRAILER')   -- rule C
ON CONFLICT DO NOTHING;

-- ─── Verification (read-only) ───
-- Expect 229 items across 34 bins.
SELECT count(*) AS items, count(DISTINCT bin) AS bins FROM inventory_items;

-- Spot-checks against the paper sheet — every column should be true.
SELECT
  (SELECT bin FROM inventory_items WHERE name = 'Isopropyl alcohol') = 'F6' AS isopropyl_f6,
  (SELECT bin FROM inventory_items WHERE name = 'Sewing box A')      = 'B6' AS sewing_a_b6,
  (SELECT bin FROM inventory_items WHERE name = 'Power strips')      = 'B3' AS power_strips_b3,
  (SELECT bin FROM inventory_items WHERE name = 'Bike 1')            = 'A2' AS bike_1_a2,
  (SELECT count(*) FROM inventory_items WHERE name = 'First aid kit') = 2   AS first_aid_in_two_bins;

-- ============================================
-- Rule B — every line dropped as a comma-inversion (58 of them)
-- ============================================
-- Each was an exact reordering of another line in the same bin, which is kept.
-- Dropped line                     kept instead
-- ----------------------------------------------------------------
-- A1  Bags, Ziploc                 Ziploc bags
-- A1  Gloves, nitrile              Nitrile gloves
-- A1  Gloves, rubber               Rubber gloves
-- A1  Gloves, latex                Latex gloves
-- A1  Gloves, leather              Leather gloves
-- A1  Gloves, work                 Work gloves
-- A1  Glover, gardening            Gardening gloves        (source typo)
-- A1  Masks, surgical              Surgical masks
-- A3  Cranks, bike                 Bike crank
-- A4  Pedals, bike                 Bike pedals
-- A4  Stems, bike                  Bike stems
-- A4  Kickstands, bike             Bike kickstand
-- A4  Training wheels, bike        Bike training wheels
-- A4  Handbook, bike               Bike handbook
-- A4  Wheel truing jig, bike       Bike wheel truing jig
-- A4  Cassette, bike               Bike cassette
-- A5  Tubes, bike                  Bike tubes
-- B2  Cable, two conductor         Two conductor cable
-- B2  Cable, three conductor       Three conductor cable
-- B2  Cable, audio                 Audio cable
-- B2  Cable, stereo                Stereo cable
-- B2  Cable, HDMI                  HDMI cable
-- B2  Cable, C7                    C7 cable
-- B2  Cable, C7P (polarized)       C7P cable (polarized)
-- B2  Cable, C13                   C13 cable (PC)
-- B2  Cable, PC                    C13 cable (PC)          (same cable)
-- B2  CD, test                     Test CD
-- B2  Cassette, test               Test cassette
-- D4  Flux, solder                 Solder flux
-- D4  Wick, solder                 Solder wick
-- D4  Pump, desoldering            Desoldering pump
-- E1  Tape, masking                Masking tape
-- E1  Tape, double sided           Double sided tape
-- E1  Tape, electrical             Electrical tape
-- E1  Tape, Packing                Packing tape
-- E1  Tape, scotch                 Scotch tape
-- E1  Tape, Teflon                 Teflon tape
-- E1  Tape, phone sealing          Phone sealing tape
-- E1  Tape, painters               Painter's tape
-- E1  Wire, metal                  Metal wire
-- E1  Wire, steel                  Steel wire
-- E2  Fuses, glass                 Glass fuses
-- E2  Fuses, thermal               Thermal fuses
-- E2  Fuses, auto                  Auto fuses
-- E2  Fuses, blade                 Blade fuses
-- E2  Wire, hookup                 Hookup wire
-- E2  Wire, copper                 Copper wire
-- E2  Wire, thermal                Thermal wire
-- E2  Wire insulation, thermal     Thermal wire insulation
-- E2  Capacitors, electrolytic     Electrolytic capacitor kit
-- E3  Belts, VCR                   VCR belts
-- E3  Movements, clock             Clock movements
-- E3  Hands, clock                 Clock hands
-- E4  Power supply, variable       Variable power supply
-- F5  Adhesive spray               Spray adhesive
-- F5  Adhesive, fabric             Fabric adhesive
-- F5  Thread locker (Loctite)      Loctite (thread locker)
-- F5  Electrical tape, liquid      Liquid electrical tape
--
-- One line was not an inversion and was rewritten rather than dropped:
-- B2  Cable, video                 -> Video cable     (no "Video cable" on the sheet)
-- B2  Test cables (see "Cable, XXX") -> Test cables   (cross-reference, moot with search)
--
-- Kept despite looking like duplicates — these are synonyms, not reorderings,
-- so dropping either would lose a word someone searches for:
--   Q-tips / Cotton swabs · Allen keys / Hex keys ·
--   Solder sucker / Desoldering pump · Drill / Power drill ·
--   AC voltage detector / Contactless AC voltage detector ·
--   Files / Small files · Wire cutters / Diagonal cutters
--
-- Not on the sheet at all: bins F1, F2 and F3 (it jumps E6 → F4).
