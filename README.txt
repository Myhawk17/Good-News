DAILY SLIDES 1.0
================

Enthalten:
- Vollbild-Swipe-Feed
- Bilder
- Kategorien
- Topmeldungen
- mehrere Quellen
- Kurz-erklärt/Kontext
- Teilen
- Favoriten lokal auf dem Gerät
- Suche
- Archiv
- zusammengehörige Meldungen / "Was bisher geschah"
- Redaktionslogin
- Dashboard
- Entwürfe
- Vorschau
- Veröffentlichen
- Bearbeiten
- Löschen
- Bild-Upload über Supabase Storage
- kostenlose PWA, geeignet für GitHub Pages

EINRICHTUNG
-----------

1. Supabase-Projekt erstellen.
2. Supabase → SQL Editor → Inhalt von SUPABASE_SETUP.sql komplett ausführen.
3. Supabase → Authentication → einen eigenen Benutzer mit E-Mail + Passwort anlegen.
4. Danach öffentliche Registrierungen/Signups deaktivieren.
   Hintergrund: Jeder authentifizierte Benutzer dieses Projekts darf redaktionell arbeiten.
5. Supabase → Project Settings / API:
   - Project URL kopieren
   - Publishable Key bzw. anon key kopieren
6. config.js öffnen und die beiden Platzhalter ersetzen.
   NIEMALS einen service_role/secret key in config.js eintragen.
7. Alle Dateien dieses Ordners in dein GitHub-Repository hochladen.
8. GitHub Pages aktivieren bzw. bestehende Pages-Seite aktualisieren.
9. App öffnen → ⚙ → mit deinem Supabase-Konto anmelden.

BILDER
------
Bilder werden in den öffentlichen Bucket "news-images" hochgeladen.
Bitte nur Bilder verwenden, für die du die nötigen Nutzungsrechte besitzt, und Bildnachweise angeben.

QUELLEN
-------
Pro Beitrag ist mindestens eine Quelle vorgesehen.
Bei Veröffentlichungen fremde Artikel nicht einfach kopieren, sondern eigene Zusammenfassungen verfassen.

INSTALLATION AUF ANDROID
------------------------
App über die GitHub-Pages-Adresse in Chrome öffnen → Menü → "App installieren"
oder "Zum Startbildschirm hinzufügen".

WICHTIGE DATEIEN
----------------
index.html           Oberfläche
style.css            Design
app.js               App-Logik
config.js            Supabase-Verbindung
SUPABASE_SETUP.sql   Datenbank + Rechte + Bildspeicher
manifest.json        PWA-Einstellungen
sw.js                Offline-/Cache-Grundlage


NEU IN VERSION 1.1 – DESIGN & APP
---------------------------------
Im Redaktionsbereich gibt es jetzt den Tab "Design & App".

Dort kannst du ohne Code ändern:
- App-Name
- Logo
- Hintergrundfarbe
- Textfarbe
- Akzentfarbe
- Überschriftengröße
- runde/eckige Darstellung
- Bildmodus: Vollbild / Bild oben / Bilder aus
- Stärke der Bildabdunklung
- Kategorie ein-/ausblenden
- Datum ein-/ausblenden
- Quellen ein-/ausblenden
- Slide-Zähler ein-/ausblenden

Die Einstellungen werden zentral in Supabase gespeichert und gelten danach für alle Leser.
