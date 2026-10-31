-- Données de test : trois livraisons envoyées par l'Italie, pas encore synchronisées.
-- Après exécution, « Synchroniser » (page Import) fait apparaître 3 nouveaux imports en attente.
-- Les lots suivent la règle du magasin : plus grands que les derniers reçus pour chaque référence.
-- Cas particulier : F0411 lot 202613301 est un lot envoyé en deux fois (déjà reçu une première fois).
-- Pour rejouer le test : supprimer d'abord ces livraisons (voir la fin du fichier).
USE magasin_kablem;

-- ---------- Livraison 1 (il y a 2 jours) : bobines et cosses ----------
INSERT INTO italie_imports (numero, date_envoi, commentaire)
VALUES ('LIV-2026-0101', NOW() - INTERVAL 2 DAY, 'Camion Cambiano - Menzel Jemil');
SET @l1 = LAST_INSERT_ID();
INSERT INTO italie_produits (italie_import_id, type, taille_bobine, reference, lot, quantite, longueur, largeur, hauteur, poids) VALUES
  (@l1, 'bobine', 'grande',  'F0411', '202613301', 2,  NULL, NULL, NULL, NULL),  -- même lot, 2e envoi
  (@l1, 'bobine', 'grande',  'F0411', '202613410', 3,  NULL, NULL, NULL, NULL),
  (@l1, 'bobine', 'petite',  'F0127', '202613411', 9,  NULL, NULL, NULL, NULL),
  (@l1, 'bobine', 'moyenne', 'F0352', '202613412', 4,  NULL, NULL, NULL, NULL),
  (@l1, 'cosse',  NULL,      'C2810', '202613413', 15, NULL, NULL, NULL, NULL),
  (@l1, 'cosse',  NULL,      'C6320', '202613414', 8,  NULL, NULL, NULL, NULL);

-- ---------- Livraison 2 (hier) : connecteurs (cartons de tailles différentes) ----------
INSERT INTO italie_imports (numero, date_envoi, commentaire)
VALUES ('LIV-2026-0102', NOW() - INTERVAL 1 DAY, 'Connecteurs TE et Lumberg');
SET @l2 = LAST_INSERT_ID();
INSERT INTO italie_produits (italie_import_id, type, taille_bobine, reference, lot, quantite, longueur, largeur, hauteur, poids) VALUES
  (@l2, 'connecteur', NULL, 'K0207', '202613420', 4, 40, 30, 15, 2.0),   -- 4 petits cartons Lumberg
  (@l2, 'connecteur', NULL, 'K0207', '202613420', 1, 60, 40, 40, 6.5),   -- 1 grand carton
  (@l2, 'connecteur', NULL, 'K0412', '202613421', 3, 50, 35, 25, 3.5),
  (@l2, 'connecteur', NULL, 'K1208', '202613422', 2, 80, 60, 50, 9.0),   -- gros cartons TE
  (@l2, 'cosse',      NULL, 'C1514', '202613423', 6, NULL, NULL, NULL, NULL);

-- ---------- Livraison 3 (aujourd'hui) : mélange ----------
INSERT INTO italie_imports (numero, date_envoi, commentaire)
VALUES ('LIV-2026-0103', NOW(), 'Livraison partielle');
SET @l3 = LAST_INSERT_ID();
INSERT INTO italie_produits (italie_import_id, type, taille_bobine, reference, lot, quantite, longueur, largeur, hauteur, poids) VALUES
  (@l3, 'bobine',     'moyenne', 'F0518', '202613430', 4, NULL, NULL, NULL, NULL),
  (@l3, 'bobine',     'petite',  'F0129', '202613431', 6, NULL, NULL, NULL, NULL),
  (@l3, 'bobine',     'grande',  'F0415', '202613432', 1, NULL, NULL, NULL, NULL),
  (@l3, 'cosse',      NULL,      'C2810', '202613433', 10, NULL, NULL, NULL, NULL),
  (@l3, 'connecteur', NULL,      'K0412', '202613434', 2, 40, 30, 20, 2.5);

-- Pour supprimer ces livraisons de la base Italie (les imports déjà synchronisés restent dans l'application) :
-- DELETE FROM italie_imports WHERE numero IN ('LIV-2026-0101', 'LIV-2026-0102', 'LIV-2026-0103');
