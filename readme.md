
## ibuild (POC)

A modern take on an automated builder for IBM i.

* Both a build solution (`build`) and a dependency building tool (`gen`)
* Easy to integrate into CI/CD solutions (like Jenkins, GitHub Actions, Azure Pipelines)
* Use in personal development environment to generate makefiles or `ibuild` configuration

## Commands

### `ibuild init`

Will build the base `project.json` file for the current working directory.

In order to build a dependency list for your project or build your project, you need a base project configuration (`project.json`). This lives in the root of the application. This file is used to define things like:

* base build library and current library
* base library list
* extensions and what commands to build them with

### `ibuild gen`

Can show possible dependency list for the current working directory. Requires a `project.json`.

`ibuild gen [--style none|make|ibuild]`.

* `--style` will let you determine what output you would like. 
   * `none` will write to standard out
   * `make` will create a `makefile`.
   * `ibuild` will create a `config.json` in each directory required. The `config.json` is used by builder part of ibuild.

### `ibuild build`

Will build your application in the correct order, based on the dependency tree.

`ibuild gen [--onlyprint] [--spool] [--force] [...files]`

* `--onlyprint` will not execute any commands, but will print them to standard out.
* `--spool` will also write spool files from any command executed to standard out/error.
* `--force` will ignore when the source was last built and force build all sources.
* `...files` allows you specify which files you want to build, in case the entire project is not required to be built.

When a source is built, the timestamp is stored for when that source was last modified. Using this method, we can detect which files have changes and only build those on the second build (and any files that depends on it). `build.json` will be created/modified when `build` is used.