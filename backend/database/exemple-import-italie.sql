-- Exemple : simuler un import envoyé par l'Italie.
-- On l'insère dans la « base Italie » (tables italie_*), puis on clique sur « Synchroniser »
-- dans la page Import : l'import apparaît « en attente » avec ses produits.
-- Le n° de livraison doit être unique (changez-le pour chaque nouvel essai).
USE magasin_kablem;

INSERT INTO italie_imports (numero, date_envoi, commentaire)
VALUES ('LIV-2026-0001', NOW(), 'Exemple de livraison');

SET @import = LAST_INSERT_ID();

INSERT INTO italie_produits (italie_import_id, type, taille_bobine, reference, lot, quantite, longueur, largeur, hauteur, poids) VALUES
  -- Bobines : la taille est obligatoire (grande, moyenne, petite)
  (@import, 'bobine', 'grande', 'F0411', '202613500', 3, NULL, NULL, NULL, NULL),
  (@import, 'bobine', 'petite', 'F0127', '202613501', 8, NULL, NULL, NULL, NULL),
  -- Cosses : quantité = nombre de cosses
  (@import, 'cosse', NULL, 'C2810', '202613502', 12, NULL, NULL, NULL, NULL),
  -- Connecteurs : dimensions d'un carton (cm) et poids (kg) ; quantité = nombre de cartons identiques
  (@import, 'connecteur', NULL, 'K0207', '202613503', 2, 40, 30, 15, 2),
  (@import, 'connecteur', NULL, 'K0207', '202613503', 1, 60, 40, 40, 6);
