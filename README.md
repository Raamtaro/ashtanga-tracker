# Ashtanga Yoga Training Tracker

## Purpose
Provide students a method to track their daily Ashtanga practice.

- Make notes of how poses feel during practice
- Score poses on various factors such as ease of access, comfort level, etc. A "final" score will be computed based on the average rating of the different factors
- Entire practice for the day is scored based the average score of the different poses practiced that day
- Students will be able to trend data as it changes over time
- Eventually students will be able to receive AI insights - hopefully optimised to spot out potential injuries or suggest changes to practice programming to optimize progress and safety/longevity


## Technical Details

### Schema
Using the Prisma ORM tool to interact with and set up the PSQL database. 

Proposed Schema includes:

1. User - name, email, password, profile(?)
2. Profile - age, height, weight, injuries, tbc...
3. Pose - name of the pose, Category (where does it show up - standing, primary, intermediate, finishing, etc...)
4. ScoreCard - the Pose being scored, the various factors being evaluated
5. PracticeSession - Collection of scorecards, a (computed) score for the session



The UX workflow for creating a log should be as follows:

1. User clicks on a "button" or something that says create flow
2. They should be given an option to select what their practice for that day/session was comprised of - there will be preset options along with the custom option
3. The preset is easy - it will just be whatever sequence they did which will automatically be appended after Surya Namaskars and Standing, and then Backbends + finishing will be added after the sequence that they did. For example, if the user selects the "Half Primary" preset, then the practice for that session will be generated as: (from first thing to last) Surya Namaskars (5 As and 3 Bs), Standing Sequence, Half Primary, Backbends, Finishing Sequence. Of course ScoreCards will be generated for each pose within these sequence chunks. 
4. The Custom builder is more difficult - the user (within reason) needs to be able to tell the program what they did for that day. So for example on Wednesday I do Full Primary plus partial Intermediate (up through Yoga Nidrasana as of now), on Thursday I do part of the Primary Sequence (not half but not quite whole), on Friday I only do only partial Intermediate up through Yoga Nidrasana, on Saturday it's full Primary and on Sunday I'll be doing Half Primary + Partial Intermediate (again, up through a certain posture). My friend has a similar practice regimen, except for with mixing the Full intermediate series and Advanced A but only up through a certain pose in the latter. So this customisation should account for similar combinations of each series (Primary, Intermediate, Advanced A, Advanced B).
5. Whichever option is chosen, the PracticeSession should be generated with ScoreCards to be filled out for each pose. They can save the Session as a draft and then publish it whenever they are ready.


How should the API format be structured in order to best achieve this? On a high level:

1. Client queries the Server to create a PracticeSession
2. The body of the request can include one of the preset options or the custom flag
3. In the case of the custom flag, the Client needs a way to indicate to the API in the body of the request as to what they have done.
4. The API then responds with ScoreCards for each pose that was done that should be ready to be filled from the client's end (if `isTwoSided` is true for a particular pose, then there are two ScoreCards generated for that pose (i.e. PoseName_Right side and then PoseName_Left Side)
5. The client fills the ScoreCard for the pose, hits save and then moves on to the next one until they are done. Not sure if the updates are best done one-by-one or as a bulk Patch/Put job...?
6. Once they are done they have an option to publish the card to their records or save it as a draft (they should be able to save and come back to it at any point while filling out the ScoreCards).

## Challenges

### 11/5/2025:

**Issue**

A traditional Ashtanga practice will at least include:

1. 5 x Surya A, 3 x Surya B
2. Standing Sequence
3. Half or Full Primary/Intermediate/Advanced A/B/C/D specific poses
4. Backbending Sequence (Starting with the 3 backbends, then optionally dropbacks, tick-tocks, catching, etc.)
5. Finishing Sequence

There is room for variation within this. 

Example: A student may do full primary one day. However the next day they may do half primary followed by only a portion of the intermediate. The day they may do full intermediate without any primary. Or maybe full intermediate + a portion of the advanced series...

And so on and so forth. In all of this, for simplicity's sake, let's say they are always sandwiching the series specific practice in between the Sun salutations, Standing sequence and Finishing Sequence (as they should be).

