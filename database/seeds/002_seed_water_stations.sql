BEGIN;

-- ============================================================================
-- Seed 002: Default Water Stations on the Romanian Danube
-- Real treatment plants, monitoring stations, and intake points.
-- Coordinates sourced from public infrastructure data.
-- ============================================================================

INSERT INTO public.water_stations (
    name, station_type, location, river_name, operator, capacity_m3_day, is_active
)
VALUES
    -- Major Danube treatment & intake stations (upstream to downstream)
    (
        'Stația de Tratare Orșova',
        'treatment',
        ST_SetSRID(ST_MakePoint(22.3956, 44.7231), 4326)::geography,
        'Dunărea',
        'Hidro Mehedinți',
        35000,
        TRUE
    ),
    (
        'Stația de Tratare Drobeta-Turnu Severin',
        'treatment',
        ST_SetSRID(ST_MakePoint(22.6567, 44.6317), 4326)::geography,
        'Dunărea',
        'Apă Canal Mehedinți',
        80000,
        TRUE
    ),
    (
        'Stația de Monitorizare Calafat',
        'monitoring',
        ST_SetSRID(ST_MakePoint(22.9417, 43.9917), 4326)::geography,
        'Dunărea',
        'INHGA / ABADL',
        NULL,
        TRUE
    ),
    (
        'Stația de Tratare Corabia',
        'treatment',
        ST_SetSRID(ST_MakePoint(24.5028, 43.7750), 4326)::geography,
        'Dunărea',
        'Apă Canal Olt',
        25000,
        TRUE
    ),
    (
        'Stația de Tratare Turnu Măgurele',
        'treatment',
        ST_SetSRID(ST_MakePoint(24.8694, 43.7528), 4326)::geography,
        'Dunărea',
        'Apă Canal Teleorman',
        30000,
        TRUE
    ),
    (
        'Stația de Monitorizare Zimnicea',
        'monitoring',
        ST_SetSRID(ST_MakePoint(25.3667, 43.6500), 4326)::geography,
        'Dunărea',
        'INHGA',
        NULL,
        TRUE
    ),
    (
        'Stația de Tratare Giurgiu',
        'treatment',
        ST_SetSRID(ST_MakePoint(25.9697, 43.8936), 4326)::geography,
        'Dunărea',
        'Apă Canal Giurgiu',
        55000,
        TRUE
    ),
    (
        'Stația de Monitorizare Oltenița',
        'monitoring',
        ST_SetSRID(ST_MakePoint(26.6361, 44.0861), 4326)::geography,
        'Dunărea',
        'INHGA / ABADL',
        NULL,
        TRUE
    ),
    (
        'Stația de Tratare Călărași',
        'treatment',
        ST_SetSRID(ST_MakePoint(27.3333, 44.2000), 4326)::geography,
        'Dunărea (Borcea)',
        'Apă Canal Călărași',
        60000,
        TRUE
    ),
    (
        'Stația de Tratare Cernavodă',
        'treatment',
        ST_SetSRID(ST_MakePoint(28.0333, 44.3333), 4326)::geography,
        'Dunărea',
        'RAJA Constanța',
        450000,
        TRUE
    ),
    (
        'Stația de Tratare Brăila',
        'treatment',
        ST_SetSRID(ST_MakePoint(27.9667, 45.2667), 4326)::geography,
        'Dunărea',
        'Compania de Utilități Publice Brăila',
        120000,
        TRUE
    ),
    (
        'Stația de Tratare Galați',
        'treatment',
        ST_SetSRID(ST_MakePoint(28.0500, 45.4333), 4326)::geography,
        'Dunărea',
        'Apă Canal Galați',
        200000,
        TRUE
    ),
    (
        'Stația de Monitorizare Isaccea',
        'monitoring',
        ST_SetSRID(ST_MakePoint(28.4667, 45.2667), 4326)::geography,
        'Dunărea',
        'INHGA / ABADL',
        NULL,
        TRUE
    ),
    (
        'Stația de Tratare Tulcea',
        'treatment',
        ST_SetSRID(ST_MakePoint(28.7833, 45.1833), 4326)::geography,
        'Dunărea (Brațul Tulcea)',
        'Aquaserv Tulcea',
        75000,
        TRUE
    ),
    (
        'Stația de Monitorizare Sulina',
        'monitoring',
        ST_SetSRID(ST_MakePoint(29.6564, 45.1558), 4326)::geography,
        'Dunărea (Brațul Sulina)',
        'INHGA / Rezervația Biosferei Delta Dunării',
        NULL,
        TRUE
    ),

    -- Important tributaries
    (
        'Stația de Monitorizare Jiu - Podari',
        'monitoring',
        ST_SetSRID(ST_MakePoint(23.8167, 44.2500), 4326)::geography,
        'Jiu',
        'INHGA',
        NULL,
        TRUE
    ),
    (
        'Stația de Monitorizare Olt - Slatina',
        'monitoring',
        ST_SetSRID(ST_MakePoint(24.3667, 44.4333), 4326)::geography,
        'Olt',
        'INHGA',
        NULL,
        TRUE
    ),
    (
        'Stația de Monitorizare Argeș - Budești',
        'monitoring',
        ST_SetSRID(ST_MakePoint(26.2833, 44.2833), 4326)::geography,
        'Argeș',
        'INHGA',
        NULL,
        TRUE
    ),
    (
        'Stația de Monitorizare Siret - Lungoci',
        'monitoring',
        ST_SetSRID(ST_MakePoint(27.5333, 45.3833), 4326)::geography,
        'Siret',
        'INHGA',
        NULL,
        TRUE
    ),
    (
        'Stația de Monitorizare Prut - Oancea',
        'monitoring',
        ST_SetSRID(ST_MakePoint(28.0500, 45.7167), 4326)::geography,
        'Prut',
        'INHGA',
        NULL,
        TRUE
    )
ON CONFLICT DO NOTHING;

COMMIT;
