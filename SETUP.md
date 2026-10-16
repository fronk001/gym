# Setting up Gym

Five steps, about fifteen minutes. Do them in this order: the database has to
accept the new app (step 1) before anything can sync.

## 1. Let the database accept Gym

1. Open the file `firestore.rules` in the **life-hub** folder (Notepad is fine;
   not Word, which locked the file last time).
2. Select everything and copy it.
3. Go to https://console.firebase.google.com, open **life-hub-fred**,
   then **Firestore Database → Rules**.
4. Select all the text there, paste over it, press **Publish**.

The new part is the `gym` block at the bottom. Life Hub and Mongolian keep working as before.

## 2. Check your imported log

Open `import/review.html` in the gym folder (double-click it). Each workout
shows what the app will hold on the left and your original Notes lines on
the right. A few places are marked in amber where I had to make a call.
Tell Claude anything that's wrong; the import can be redone in a second.

## 3. Put your log online (on the laptop)

1. Double-click **Start Gym.bat** in the gym folder. The app opens in the browser.
2. Sign in with your Life Hub email and password.
3. Press **Start with my Notes log**.

Your 2026 workouts and the 2022 archive are now online.

## 4. Publish the app (GitHub)

1. On https://github.com/new create a repository named **gym**, Public, with nothing in it
   (no README).
2. Tell Claude it exists: Claude pushes the code.
3. In the repository: **Settings → Pages → Source: GitHub Actions**.

A minute later the app is at https://fronk001.github.io/gym/.

## 5. Install it on your iPhone

1. Open **Safari** at https://fronk001.github.io/gym/.
2. **Share → Add to Home Screen → Add.**
3. Open Gym from the home screen and sign in there: the installed app has its
   own storage, separate from Safari.

From then on every set you tick also ticks **Gym** in Life Hub, on the day
you trained. Life Hub needs its own update for that (Claude pushes it with step 4).

## Good to know

- The rest timer starts when you tick a set. The screen stays on during a
  workout. The beep follows the mute switch and plays over your music; the bar
  turning green always works.
- Unticked sets aren't saved when you finish, so tick as you go.
- Forgot to log? "Log a workout on an earlier day" on the home screen.
