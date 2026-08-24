-- Sanitize the events table by removing mock/simulated data

BEGIN;

-- Method 1: Delete all events where the machine name starts with the known simulation prefixes
DELETE FROM events WHERE machine LIKE 'MOCK-ENDPOINT-%';
DELETE FROM events WHERE machine LIKE 'RED-BR1-%';
DELETE FROM events WHERE machine LIKE 'HQ-SRV-%';

-- Method 2: Delete all events that explicitly contain the word "simulated" or "Mock ID"
DELETE FROM events WHERE message LIKE '%(Mock ID:%';
DELETE FROM events WHERE message LIKE '%simulated%';

-- Method 3 (Aggressive/Safe): Delete ALL events EXCEPT those from your known real machines
DELETE FROM events WHERE machine NOT IN ('DC01', 'GIRI', 'D3F53C0N3-PC-1');
DELETE FROM machines WHERE name NOT IN ('DC01', 'GIRI', 'D3F53C0N3-PC-1');

COMMIT;
