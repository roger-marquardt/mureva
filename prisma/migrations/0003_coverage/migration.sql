-- CreateTable
CREATE TABLE "Country" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hasStates" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Country_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "State" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "State_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoverageCity" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "stateId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoverageCity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoverageSite" (
    "id" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoverageSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoverageSiteCity" (
    "siteId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoverageSiteCity_pkey" PRIMARY KEY ("siteId","cityId")
);

-- CreateIndex
CREATE UNIQUE INDEX "State_countryId_id_key" ON "State"("countryId", "id");

-- CreateIndex
-- NULLS NOT DISTINCT (added by hand): in a country without states, stateId is NULL for every city,
-- and a plain unique index would let the same slug be inserted twice there.
CREATE UNIQUE INDEX "CoverageCity_countryId_stateId_slug_key" ON "CoverageCity"("countryId", "stateId", "slug") NULLS NOT DISTINCT;

-- CreateIndex
CREATE UNIQUE INDEX "CoverageSite_host_key" ON "CoverageSite"("host");

-- CreateIndex
CREATE INDEX "CoverageSiteCity_cityId_idx" ON "CoverageSiteCity"("cityId");

-- AddForeignKey
ALTER TABLE "State" ADD CONSTRAINT "State_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageCity" ADD CONSTRAINT "CoverageCity_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageCity" ADD CONSTRAINT "CoverageCity_countryId_stateId_fkey" FOREIGN KEY ("countryId", "stateId") REFERENCES "State"("countryId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageSiteCity" ADD CONSTRAINT "CoverageSiteCity_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "CoverageSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageSiteCity" ADD CONSTRAINT "CoverageSiteCity_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "CoverageCity"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row shape checks (not expressible in schema.prisma). A malformed code, host or slug would never
-- match a lookup and would silently block crawling, so reject it on write instead.
-- Country and State ids are natural keys: "BR", and "BR_AC" for state AC of BR.
ALTER TABLE "Country" ADD CONSTRAINT "Country_id_check" CHECK ("id" ~ '^[A-Z]{2}$');

ALTER TABLE "Country" ADD CONSTRAINT "Country_name_check" CHECK ("name" = btrim("name") AND "name" <> '');

ALTER TABLE "State" ADD CONSTRAINT "State_code_check" CHECK ("code" ~ '^[A-Z0-9]{1,3}$');

ALTER TABLE "State" ADD CONSTRAINT "State_id_check" CHECK ("id" = "countryId" || '_' || "code");

ALTER TABLE "State" ADD CONSTRAINT "State_name_check" CHECK ("name" = btrim("name") AND "name" <> '');

ALTER TABLE "CoverageCity" ADD CONSTRAINT "CoverageCity_name_check" CHECK ("name" = btrim("name") AND "name" <> '');

ALTER TABLE "CoverageCity" ADD CONSTRAINT "CoverageCity_slug_check" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

ALTER TABLE "CoverageSite" ADD CONSTRAINT "CoverageSite_host_check"
    CHECK ("host" ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$');

-- Country."hasStates" rules. They span tables, so they are triggers rather than CHECKs:
--   * a city has a state exactly when its country has states (the composite foreign key above
--     already guarantees the state belongs to the city's country);
--   * a country without states has no State rows;
--   * the flag can only change while the country has no states and no cities.
-- FOR SHARE makes a concurrent flag change wait for the row being written here.
CREATE FUNCTION "coverage_city_state_rule"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    country_has_states BOOLEAN;
BEGIN
    SELECT "hasStates" INTO country_has_states FROM "Country" WHERE "id" = NEW."countryId" FOR SHARE;
    IF country_has_states AND NEW."stateId" IS NULL THEN
        RAISE EXCEPTION 'city "%" needs a state: its country has states', NEW."name"
            USING ERRCODE = 'check_violation';
    ELSIF NOT country_has_states AND NEW."stateId" IS NOT NULL THEN
        RAISE EXCEPTION 'city "%" cannot have a state: its country has no states', NEW."name"
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "CoverageCity_state_rule"
    BEFORE INSERT OR UPDATE OF "countryId", "stateId" ON "CoverageCity"
    FOR EACH ROW EXECUTE FUNCTION "coverage_city_state_rule"();

CREATE FUNCTION "state_country_rule"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    country_has_states BOOLEAN;
BEGIN
    SELECT "hasStates" INTO country_has_states FROM "Country" WHERE "id" = NEW."countryId" FOR SHARE;
    IF NOT country_has_states THEN
        RAISE EXCEPTION 'state "%" cannot be added: its country has no states', NEW."id"
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "State_country_rule"
    BEFORE INSERT OR UPDATE OF "countryId" ON "State"
    FOR EACH ROW EXECUTE FUNCTION "state_country_rule"();

CREATE FUNCTION "country_has_states_rule"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM "State" WHERE "countryId" = NEW."id")
        OR EXISTS (SELECT 1 FROM "CoverageCity" WHERE "countryId" = NEW."id") THEN
        RAISE EXCEPTION 'country "%" has states or cities: "hasStates" cannot change', NEW."id"
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "Country_has_states_rule"
    BEFORE UPDATE OF "hasStates" ON "Country"
    FOR EACH ROW WHEN (OLD."hasStates" IS DISTINCT FROM NEW."hasStates")
    EXECUTE FUNCTION "country_has_states_rule"();

-- Reference data: Brazil and its 27 federative units. No city is seeded, so nothing is in play yet.
INSERT INTO "Country" ("id", "name", "hasStates") VALUES ('BR', 'Brasil', true);

INSERT INTO "State" ("id", "countryId", "code", "name") VALUES
    ('BR_AC', 'BR', 'AC', 'Acre'),
    ('BR_AL', 'BR', 'AL', 'Alagoas'),
    ('BR_AP', 'BR', 'AP', 'Amapá'),
    ('BR_AM', 'BR', 'AM', 'Amazonas'),
    ('BR_BA', 'BR', 'BA', 'Bahia'),
    ('BR_CE', 'BR', 'CE', 'Ceará'),
    ('BR_DF', 'BR', 'DF', 'Distrito Federal'),
    ('BR_ES', 'BR', 'ES', 'Espírito Santo'),
    ('BR_GO', 'BR', 'GO', 'Goiás'),
    ('BR_MA', 'BR', 'MA', 'Maranhão'),
    ('BR_MT', 'BR', 'MT', 'Mato Grosso'),
    ('BR_MS', 'BR', 'MS', 'Mato Grosso do Sul'),
    ('BR_MG', 'BR', 'MG', 'Minas Gerais'),
    ('BR_PA', 'BR', 'PA', 'Pará'),
    ('BR_PB', 'BR', 'PB', 'Paraíba'),
    ('BR_PR', 'BR', 'PR', 'Paraná'),
    ('BR_PE', 'BR', 'PE', 'Pernambuco'),
    ('BR_PI', 'BR', 'PI', 'Piauí'),
    ('BR_RJ', 'BR', 'RJ', 'Rio de Janeiro'),
    ('BR_RN', 'BR', 'RN', 'Rio Grande do Norte'),
    ('BR_RS', 'BR', 'RS', 'Rio Grande do Sul'),
    ('BR_RO', 'BR', 'RO', 'Rondônia'),
    ('BR_RR', 'BR', 'RR', 'Roraima'),
    ('BR_SC', 'BR', 'SC', 'Santa Catarina'),
    ('BR_SP', 'BR', 'SP', 'São Paulo'),
    ('BR_SE', 'BR', 'SE', 'Sergipe'),
    ('BR_TO', 'BR', 'TO', 'Tocantins');
