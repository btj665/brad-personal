THE TABLES
Sixteen casino games, four slot cabinets, and thirty-five solitaires — the whole
floor, running on your own machine, no internet needed once you have this folder.


HOW TO PLAY

  Windows    Double-click:  Start The Tables (Windows).bat
  Mac        Double-click:  Start The Tables (Mac).command
  Linux      Run:           ./start-linux.sh

A window opens, and the game opens in your web browser a moment later. Leave that
window open while you play; close it when you're done.

The games are Blackjack, Baccarat, Pai Gow, Ultimate Hold'em, Three Card Poker,
Caribbean Stud, Mississippi Stud, Let It Ride, Casino War, Craps, Roulette, Sic
Bo, Big Six, Video Poker, Slots, Keno, and Solitaire (thirty-five variants).
Nothing is real money — the chips are pretend and the bankroll refills.


IF IT ASKS ABOUT NODE.JS

The game runs on a small free program called Node.js. If your machine doesn't
have it, the launcher offers to install it for you:

  - Windows installs it automatically (approve the prompt), then you double-click
    the launcher one more time.
  - Mac installs it automatically if you have Homebrew; otherwise it opens the
    download page — install it, then run the launcher again.
  - Linux prints the one command to run, then you start it again.

You only ever do this once.


MAC: "UNIDENTIFIED DEVELOPER"

The first time on a Mac, you may see a warning that the file is from an
unidentified developer. That's normal for something not from the App Store.
Right-click (or Control-click) the .command file, choose Open, then Open again.
After the first time it just works.


SHARING IT ON YOUR NETWORK (optional)

By default the game runs only on your own computer. If you'd like others on the
same office network to reach your copy, start it from a terminal with:

  Mac / Linux:   HOST=0.0.0.0 node serve.mjs
  Windows:       set HOST=0.0.0.0 && node serve.mjs

It will print an address other people can open in their browsers.


WHAT'S IN HERE

  app/         the game itself (a website that runs in your browser)
  serve.mjs    the little program that hands the game to your browser
  the three launchers above

That's everything. Enjoy the tables.
