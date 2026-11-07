# Alerte Verbier — 2 billets train + ski, 5 décembre 2026

**Statut initial : non activé.** Le code et la planification sont prêts ; l'envoi nécessite les secrets ci-dessous et la variable d'activation. Aucun compte de billetterie ni moyen de paiement n'est utilisé.

## Ce que le suivi vérifie

- Produit officiel **426820**, Opening Session + Saint-Nicolas Express (avec train), date **2026-12-05**, 07:00–19:30.
- Quantité numérique explicite d'au moins **2** dans `availabilityByDate`, puis dans la réponse du tarif Participant **0866401**, **5 CHF** par personne ; nouvelle lecture de la disponibilité après le tarif.
- Une mention « Acheter maintenant », un prix affiché, un balisage `InStock`, une page modifiée ou la disparition du texte « épuisé » ne déclenche jamais une alerte.
- Les données absentes, ambiguës, non JSON, trop anciennes selon l'en-tête Age, les erreurs et les protections d'accès ne déclenchent aucun email de disponibilité.
- Un email au maximum par jour, uniquement après ces confirmations. Il constate la disponibilité ; il ne réserve pas et ne garantit pas qu'elle persistera jusqu'à l'achat.

## Configuration email (Brevo gratuit)

1. Créer soi-même un compte sur https://app.brevo.com/account/register, valider l'adresse email et terminer l'inscription gratuite. Ne pas choisir d'offre payante pour ce suivi.
2. Activer l'envoi transactionnel si nécessaire et faire valider un expéditeur autorisé dans Brevo. Une adresse institutionnelle ne garantit pas que l'on puisse l'utiliser comme expéditeur ; suivre les exigences de validation de Brevo. L'adresse destinataire peut rester l'adresse EPFL.
3. Créer une clé API Brevo et la saisir **directement** dans GitHub > Settings > Secrets and variables > Actions > New repository secret. Ne pas la mettre dans le chat, les fichiers ou les logs.
4. Ajouter les secrets :
   - `BREVO_API_KEY` : clé API du service d'envoi, jamais un mot de passe email.
   - `MAIL_FROM` : adresse de l'expéditeur validé dans Brevo.
   - `MAIL_TO` : adresse destinataire choisie par l'utilisateur (à saisir dans le secret, elle n'est pas publiée dans ce dépôt).
5. Dans l'onglet Variables, créer `MONITOR_ENABLED` avec la valeur `true` une fois les secrets prêts.
6. Lancer Actions > Verbier ticket monitor > Run workflow pour vérifier l'exécution. Le samedi/dimanche, le suivi ne contacte pas le site et n'envoie rien. Un essai de réception avec un message de test doit être effectué dans Brevo, séparément du suivi ; ne jamais inventer une disponibilité pour tester l'email.

## Planification et coût

Le workflow est exécuté sur GitHub, ordinateur personnel éteint, toutes les 5 minutes du lundi au vendredi en heure suisse (24 h/24). Les minutes sont décalées à 02, 07, 12, etc. GitHub peut retarder ou supprimer des exécutions : aucune garantie de délai de cinq minutes.

Le script arrête les consultations après le vendredi **4 décembre 2026**. Désactiver ensuite le workflow dans Actions pour arrêter aussi les démarrages inutiles. Sans variable d'activation il reste inactif. L'alerte horaire ChatGPT est indépendante.

Les runners standard GitHub sont gratuits dans un dépôt public. Le forfait gratuit Brevo inclut actuellement 300 emails/jour ; ce script tente au maximum un email/jour. Ne pas activer de services payants. GitHub désactive les planifications des dépôts publics sans activité pendant 60 jours (ce suivi dure moins longtemps).

## Respect du site et exploitation

Les routes JSON sont celles déclarées par la page officielle et utilisées par son formulaire, sans authentification. `robots.txt` est consulté avant les requêtes à chaque vérification ; ses exclusions sont respectées. Les conditions générales consultées le 7 novembre 2026 n'établissent pas une autorisation explicite de robot : respecter toute nouvelle restriction et arrêter le suivi si l'exploitant le demande.

Une vérification ordinaire fait 3 lectures (robots, page, disponibilité). Si deux places sont annoncées, elle fait jusqu'à 2 lectures supplémentaires (tarif, confirmation). Aucun ajout au panier, aucun CAPTCHA résolu, aucun contournement, proxy ou changement d'identité. Le délai minimal de 300 secondes est persisté avant les consultations, y compris entre lancements manuels. Une exécution retardée peut donc entraîner un contrôle sauté.

Les erreurs 401/403 ou une exclusion robots mettent le suivi en pause persistante (`halted`). Les réponses 429/503 imposent une pause d'au moins une heure et respectent un Retry-After plus long. Les autres erreurs n'entraînent pas de nouvelle tentative immédiate.

L'état `.monitor-state.json` est écrit avec le `GITHUB_TOKEN` temporaire du workflow, sans jeton personnel. Le groupe de concurrence sérialise les exécutions. L'état ne contient aucun secret ni adresse email. Le dépôt doit autoriser l'écriture du token ; une erreur de persistance arrête le suivi avant l'envoi.

La tentative d'email est enregistrée **avant** l'appel à Brevo pour éviter les doublons après une interruption. Si l'envoi échoue ou reste ambigu, il n'est pas retenté automatiquement le même jour. Vérifier les logs et le journal Brevo ; retirer `alertAttemptDay` de l'état uniquement après vérification, puis relancer. L'acceptation par l'API n'est pas une preuve de livraison en boîte de réception.

Les notifications propres à GitHub concernant les échecs d'Actions dépendent des réglages de votre compte ; elles sont distinctes des emails de disponibilité du script.

## Vérification locale

Node.js 22, sans dépendance externe : `node --test monitor.test.mjs`.

Les tests couvrent les stocks 0/1/2, types ambigus, mauvaise date, mauvais tarif, erreurs, jour suisse, échéance et règles robots. Au 7 novembre 2026, la réponse réelle indiquait **0/112** et le formulaire affichait « Épuisé ». Le chemin d'envoi réel reste à valider après la configuration du service email.

Sources : [billetterie officielle](https://verbier4vallees.ch/fr/shop-en-ligne/activites/opening-session-saint-nicolas-express_activity_426820), [robots.txt](https://verbier4vallees.ch/robots.txt), [planification GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule), [gratuité runners publics](https://docs.github.com/en/actions/concepts/billing-and-usage), [forfaits Brevo](https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans), [API email Brevo](https://developers.brevo.com/reference/send-transac-email).
