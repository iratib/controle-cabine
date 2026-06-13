-- Migration : corriger le type_vol des compagnies Gros Porteur
-- Compagnies concernées : EY (Etihad), GF (Gulf Air), KU (Kuwait Airways),
--                         QR (Qatar Airways), SV (Saudia), TK (Turkish Airlines)
--
-- Vérification avant update (optionnel — à exécuter en premier pour contrôler)
-- SELECT id, numero_vol, type_vol
-- FROM vols
-- WHERE numero_vol ~ '^(EY|GF|KU|QR|SV|TK)[0-9A-Z]'
--   AND type_vol <> 'Gros Porteur Transit';

UPDATE vols
SET type_vol = 'Gros Porteur Transit'
WHERE numero_vol ~ '^(EY|GF|KU|QR|SV|TK)[0-9A-Z]'
  AND type_vol <> 'Gros Porteur Transit';
