# Contributing

This repository is published from the Wonop repository on each release; a
change made here is replaced by the next release. Report bugs and suggest
changes through [wonop.com](https://wonop.com).

To try a change locally, you need [Deno](https://deno.com) 2.x:

    deno task ci      # the package's tests and the runtime API check

and link your clone into Wonop so every save is the installed package:

    await wm.dev.link("/path/to/design-studio-wonop")
