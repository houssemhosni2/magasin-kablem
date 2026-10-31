-- Exemples pour les pages Import et Gestion de stock.
-- Chaque import (arrivage) regroupe plusieurs produits ; ces imports sont déjà « ajoutés au stock ».
-- Les dates sont fixées pour simuler un historique (normalement : date système au moment de « Ajouter au stock »).
-- Tous les produits d'un même import ont la même date de réception.
-- Formats repris de l'outil Access du magasin : référence F0411, lot 202613252, quantités volontairement petites (1 à 9).
-- À exécuter sur une base neuve, juste après schema.sql. Pour les retirer : voir la fin du fichier.
USE magasin_kablem;

INSERT INTO imports (id, statut, date_creation, date_ajout_stock, cree_par, ajoute_par) VALUES
  (1, 'ajoute', '2026-09-29 08:15:00', '2026-09-29 08:15:00', 1, 1),
  (2, 'ajoute', '2026-09-30 09:30:00', '2026-09-30 09:30:00', 1, 1),
  (3, 'ajoute', '2026-10-01 11:30:00', '2026-10-01 11:30:00', 1, 1),
  (4, 'ajoute', '2026-10-02 14:20:00', '2026-10-02 14:20:00', 1, 1),
  (5, 'ajoute', '2026-10-03 15:10:00', '2026-10-03 15:10:00', 1, 1),
  (6, 'ajoute', '2026-10-05 09:05:00', '2026-10-05 09:05:00', 1, 1),
  (7, 'ajoute', '2026-10-06 09:42:00', '2026-10-06 09:42:00', 1, 1),
  (8, 'ajoute', '2026-10-07 08:50:00', '2026-10-07 08:50:00', 1, 1);

INSERT INTO receptions (import_id, type, taille_bobine, reference, lot, date_reception, quantite, utilisateur_id) VALUES
  (1, 'bobine', 'grande', 'F0411', '202613252', '2026-09-29 08:15:00', 1, 1),
  (1, 'bobine', 'grande', 'F0411', '202613252', '2026-09-29 08:15:00', 6, 1),
  (1, 'bobine', 'grande', 'F0411', '202613252', '2026-09-29 08:15:00', 2, 1),
  (1, 'bobine', 'grande', 'F0411', '202613252', '2026-09-29 08:15:00', 7, 1),
  (1, 'cosse', NULL, 'C2810', '202613255', '2026-09-29 08:15:00', 3, 1),
  (1, 'cosse', NULL, 'C2810', '202613255', '2026-09-29 08:15:00', 8, 1),
  (2, 'bobine', 'grande', 'F0411', '202613301', '2026-09-30 09:30:00', 4, 1),
  (2, 'bobine', 'grande', 'F0411', '202613301', '2026-09-30 09:30:00', 9, 1),
  (2, 'cosse', NULL, 'C1514', '202613292', '2026-09-30 09:30:00', 5, 1),
  (3, 'bobine', 'grande', 'F0415', '202613258', '2026-10-01 11:30:00', 1, 1),
  (3, 'bobine', 'grande', 'F0415', '202613258', '2026-10-01 11:30:00', 6, 1),
  (4, 'bobine', 'moyenne', 'F0352', '202613264', '2026-10-02 14:20:00', 3, 1),
  (4, 'bobine', 'moyenne', 'F0352', '202613264', '2026-10-02 14:20:00', 8, 1),
  (4, 'bobine', 'moyenne', 'F0352', '202613264', '2026-10-02 14:20:00', 4, 1),
  (4, 'cosse', NULL, 'C6320', '202613270', '2026-10-02 14:20:00', 9, 1),
  (4, 'cosse', NULL, 'C6320', '202613270', '2026-10-02 14:20:00', 5, 1),
  (5, 'bobine', 'moyenne', 'F0518', '202613277', '2026-10-03 15:10:00', 1, 1),
  (6, 'bobine', 'moyenne', 'F0518', '202613295', '2026-10-05 09:05:00', 2, 1),
  (6, 'cosse', NULL, 'C2810', '202613305', '2026-10-05 09:05:00', 7, 1),
  (7, 'bobine', 'petite', 'F0127', '202613281', '2026-10-06 09:42:00', 3, 1),
  (7, 'bobine', 'petite', 'F0127', '202613281', '2026-10-06 09:42:00', 8, 1),
  (8, 'bobine', 'petite', 'F0129', '202613288', '2026-10-07 08:50:00', 4, 1);

-- Chaque ligne en stock (quantité N = N produits identiques) commence « non rangée » :
-- cliquer sur « Ranger automatiquement » dans Gestion de stock pour la ranger selon les règles.
INSERT INTO placements (reception_id, emplacement, quantite)
SELECT id, NULL, quantite FROM receptions WHERE import_id BETWEEN 1 AND 9;

-- Pour supprimer ces exemples (supprime aussi leurs produits) :
-- DELETE FROM imports WHERE id BETWEEN 1 AND 9;
