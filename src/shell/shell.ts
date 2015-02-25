/**
 * Copyright 2014 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Let's you run Shumway from the command line.
 */

declare var scriptArgs;
declare var arguments;
declare var load;
declare var quit;
declare var read;
declare var help;

load("src/avm2/compiler/relooper/relooper.js");

var homePath = "";
var builtinLibPath = homePath + "build/libs/builtin.abc";
var shellLibPath = homePath + "build/libs/shell.abc";
var playerglobalInfo = {
  abcs: homePath + "build/playerglobal/playerglobal.abcs",
  catalog: homePath + "build/playerglobal/playerglobal.json"
};

declare var readFile, readBinaryFile, readbuffer;
var isV8 = typeof readbuffer !== 'undefined';
var isJSC = typeof readFile !== 'undefined';
if (isV8) {
  var oldread = read;
  read = function (path, type) {
    return type === 'binary' ? new Uint8Array(readbuffer(path)) : oldread(path);
  }
} else if (isJSC) {
  if (typeof readBinaryFile === 'undefined') {
    throw new Error('readBinaryFile was not found');
  }
  read = function (path, type) {
    return type === 'binary' ? new Uint8Array(readBinaryFile(path)) : readFile(path);
  }
}
if (typeof read === 'undefined') {
  throw new Error('Unable to simulate read()');
}

if (isV8 || isJSC) {
  // v8 and jsc will fail for Promises
  this.Promise = undefined;
}

/**
 * Global unitTests array, unit tests add themselves to this. The list may have numbers, these indicate the
 * number of times to run the test following it. This makes it easy to disable test by pushing a zero in
 * front.
 */
var unitTests = [];

declare var microTaskQueue: Shumway.Shell.MicroTasksQueue;

var commandLineArguments: string [];
// SpiderMonkey
if (typeof scriptArgs === "undefined") {
  commandLineArguments = arguments;
} else {
  commandLineArguments = scriptArgs;
}

// The command line parser isn't yet available, so do a rough manual check for whether the bundled
// player source should be used.
if (commandLineArguments.indexOf('-b') >= 0 || commandLineArguments.indexOf('--closure-bundle') >= 0) {
  load('build/bundles-cc/shumway.player.js');
} else if (commandLineArguments.indexOf('--bundle') >= 0) {
  load('build/bundles/shumway.player.js');
} else {
  /* Autogenerated player references: base= */

  load("build/ts/base.js");
  load("build/ts/tools.js");

  load("build/ts/avm2.js");

  load("build/ts/swf.js");

  load("build/ts/flash.js");

  load("build/ts/avm1.js");

  load("build/ts/gfx-base.js");
  load("build/ts/player.js");

  /* Autogenerated player references end */
}

module Shumway.Shell {
  import assert = Shumway.Debug.assert;
  import AbcFile = Shumway.AVM2.ABC.AbcFile;
  import Option = Shumway.Options.Option;
  import OptionSet = Shumway.Options.OptionSet;
  import ArgumentParser = Shumway.Options.ArgumentParser;

  import Runtime = Shumway.AVM2.Runtime;
  import SwfTag = Shumway.SWF.Parser.SwfTag;
  import DataBuffer = Shumway.ArrayUtilities.DataBuffer;
  import flash = Shumway.AVM2.AS.flash;

  import Compiler = Shumway.AVM2.Compiler;

  class ShellPlayer extends Shumway.Player.Player {
    onSendUpdates(updates:DataBuffer, assets:Array<DataBuffer>, async:boolean = true):DataBuffer {
      var bytes = updates.getBytes();
      if (!async) {
        // Simulating text field metrics
        var buffer = new DataBuffer()
        buffer.write2Ints(1, 1); // textWidth, textHeight
        buffer.writeInt(0); // offsetX
        buffer.writeInt(0); // numLines
        buffer.position = 0;
        return buffer;
      }
      // console.log('Updates sent');
      return null;
    }
    onFSCommand(command: string, args: string) {
      if (command === 'quit') {
        // console.log('Player quit');
        microTaskQueue.stop();
      }
    }
    onFrameProcessed() {
      // console.log('Frame');
    }
  }

  var verbose = false;
  var writer = new IndentingWriter();

  var parseOption: Option;
  var parseForDatabaseOption: Option;
  var disassembleOption: Option;
  var compileOption: Option;
  var verboseOption: Option;
  var profileOption: Option;
  var releaseOption: Option;
  var executeOption: Option;
  var interpreterOption: Option;
  var symbolFilterOption: Option;
  var microTaskDurationOption: Option;
  var microTaskCountOption: Option;
  var loadPlayerGlobalOption: Option;
  var loadShellLibOption: Option;
  var porcelainOutputOption: Option;
  var usePlayerBundleOption: Option;
  var usePlayerClosureBundleOption: Option;

  var fuzzMillOption: Option;

  export function main(commandLineArguments: string []) {
    var systemOptions: Shumway.Options.OptionSet = Shumway.Settings.shumwayOptions;
    var shellOptions = systemOptions.register(new Shumway.Options.OptionSet("Shell Options"));

    parseOption = shellOptions.register(new Option("p", "parse", "boolean", false, "Parse File(s)"));
    parseForDatabaseOption = shellOptions.register(new Option("po", "parseForDatabase", "boolean", false, "Parse File(s)"));
    disassembleOption = shellOptions.register(new Option("d", "disassemble", "boolean", false, "Disassemble File(s)"));
    compileOption = shellOptions.register(new Option("c", "compile", "boolean", false, "Compile File(s)"));
    verboseOption = shellOptions.register(new Option("v", "verbose", "boolean", false, "Verbose"));
    profileOption = shellOptions.register(new Option("o", "profile", "boolean", false, "Profile"));
    releaseOption = shellOptions.register(new Option("r", "release", "boolean", false, "Release mode"));
    usePlayerClosureBundleOption = shellOptions.register(new Option('b', "closure-bundle", "boolean", false, "Use bundled and closure compiled source file for the player."));
    usePlayerBundleOption = shellOptions.register(new Option('', "bundle", "boolean", false, "Use bundled source file for the player."));
    executeOption = shellOptions.register(new Option("x", "execute", "boolean", false, "Execute File(s)"));
    interpreterOption = shellOptions.register(new Option("i", "interpreter", "boolean", false, "Interpreter Only"));
    symbolFilterOption = shellOptions.register(new Option("f", "filter", "string", "", "Symbol Filter"));
    microTaskDurationOption = shellOptions.register(new Option("md", "duration", "number", 0, "Micro task duration."));
    microTaskCountOption = shellOptions.register(new Option("mc", "count", "number", 0, "Micro task count."));
    loadPlayerGlobalOption = shellOptions.register(new Option("g", "playerGlobal", "boolean", false, "Load Player Global"));
    loadShellLibOption = shellOptions.register(new Option("s", "shell", "boolean", false, "Load Shell Global"));
    porcelainOutputOption = shellOptions.register(new Option('', "porcelain", "boolean", false, "Keeps outputs free from the debug messages."));

    fuzzMillOption = shellOptions.register(new Option('', "fuzz", "string", "", "Generates random SWFs XML."));

    var argumentParser = new ArgumentParser();
    argumentParser.addBoundOptionSet(systemOptions);

    function printUsage() {
      var version = Shumway.version + ' (' + Shumway.build + ')';
      writer.enter("Shumway Command Line Interface. Version: " + version);
      systemOptions.trace(writer);
      writer.leave("");
    }

    argumentParser.addArgument("h", "help", "boolean", {parse: function (x) {
      printUsage();
    }});

    var files = [];

    // Try and parse command line arguments.

    try {
      argumentParser.parse(commandLineArguments).filter(function (value, index, array) {
        if (value.endsWith(".abc") || value.endsWith(".swf") || value.endsWith(".js")) {
          files.push(value);
        } else {
          return true;
        }
      });
    } catch (x) {
      writer.writeLn(x.message);
      quit();
    }

    initializePlayerServices();

    microTaskQueue = new Shumway.Shell.MicroTasksQueue();

    if (porcelainOutputOption.value) {
      console.info = console.log = console.warn = console.error = function () {};
    }

    profile = profileOption.value;
    release = releaseOption.value;
    verbose = verboseOption.value;

    if (!verbose) {
      IndentingWriter.logLevel = Shumway.LogLevel.Error | Shumway.LogLevel.Warn;
    }

    if (fuzzMillOption.value) {
      var fuzzer = new Shumway.Shell.Fuzz.Mill(new IndentingWriter(), fuzzMillOption.value);
      fuzzer.fuzz();
    }

    Shumway.Unit.writer = new IndentingWriter();

    if (compileOption.value) {
      var abcs = [];
      files.forEach(function (file) {
        var buffer = new Uint8Array(read(file, "binary"));
        if (file.endsWith(".abc")) {
          abcs.push(new AbcFile(buffer, file));
        } else if (file.endsWith(".swf")) {
          abcs.push.apply(abcs, extractABCsFromSWF(buffer));
        }
      });
      Compiler.baselineCompileABCs(abcs.slice(0, 1), abcs.slice(1));
    }

    if (parseOption.value) {
      files.forEach(function (file) {
        var start = dateNow();
        writer.debugLn("Parsing: " + file);
        profile && SWF.timelineBuffer.reset();
        parseFile(file, parseForDatabaseOption.value, symbolFilterOption.value.split(","));
        var elapsed = dateNow() - start;
        if (verbose) {
          verbose && writer.writeLn("Total Parse Time: " + (elapsed).toFixed(2) + " ms.");
          profile && SWF.timelineBuffer.createSnapshot().trace(writer);
        }
      });
    }

    if (executeOption.value) {
      var shouldLoadPlayerGlobal = loadPlayerGlobalOption.value;
      if (!shouldLoadPlayerGlobal) {
        // We need to load player globals if any swfs need to be executed.
        files.forEach(file => {
          if (file.endsWith(".swf")) {
            shouldLoadPlayerGlobal = true;
          }
        });
      }
      initializeAVM2(shouldLoadPlayerGlobal, loadShellLibOption.value);
      files.forEach(function (file) {
        executeFile(file);
      });
    } else if (disassembleOption.value) {
      files.forEach(function (file) {
        if (file.endsWith(".abc")) {
          disassembleABCFile(file);
        }
      });
    }

    if (Shumway.Unit.everFailed) {
      writer.errorLn('Some unit tests failed');
      quit(1);
    }
  }

  function disassembleABCFile(file: string) {
    var buffer = read(file, "binary");
    var abc = new AbcFile(new Uint8Array(buffer), file);
    abc.trace(writer);
  }

  function executeFile(file: string): boolean {
    if (file.endsWith(".js")) {
      executeUnitTestFile(file);
    } else if (file.endsWith(".abc")) {
      executeABCFile(file);
    } else if (file.endsWith(".swf")) {
      executeSWFFile(file, microTaskDurationOption.value, microTaskCountOption.value);
    }
    return true;
  }

  function executeSWFFile(file: string, runDuration: number, runCount: number) {
    function runSWF(file: any) {
      flash.display.Loader.reset();
      flash.display.DisplayObject.reset();
      flash.display.MovieClip.reset();
      var player = new ShellPlayer();
      player.load(file);
    }
    var asyncLoading = true;
    if (asyncLoading) {
      (<any>Shumway.FileLoadingService.instance).setBaseUrl(file);
      runSWF(file);
    } else {
      (<any>Shumway.FileLoadingService.instance).setBaseUrl(file);
      runSWF(read(file, 'binary'));
    }
    console.info("Running: " + file);
    microTaskQueue.run(runDuration, runCount, true);
  }

  function executeABCFile(file: string) {
    verboseOption.value && writer.writeLn("Running ABC: " + file);
    var buffer = read(file, "binary");
    try {
      Runtime.AVM2.instance.applicationDomain.executeAbc(new AbcFile(new Uint8Array(buffer), file));
    } catch (x) {
      writer.writeLns(x.stack);
    }
    verboseOption.value && writer.outdent();
  }

  function executeUnitTestFile(file: string) {
    writer.writeLn("Running test file: " + file + " ...");
    var start = dateNow();
    load(file);
    var testCount = 0;
    while (unitTests.length) {
      var test = unitTests.shift();
      var repeat = 1;
      if (typeof test === "number") {
        repeat = test;
        test = unitTests.shift();
      }
      if (verbose && test.name) {
        writer.writeLn("Test: " + test.name);
      }
      testCount += repeat;
      try {
        for (var i = 0; i < repeat; i++) {
          test();
        }
      } catch (x) {
        writer.redLn('Exception encountered while running ' + file + ':' + '(' + x + ')');
        writer.redLns(x.stack);
      }
    }
    writer.writeLn("Completed " + testCount + " test" + (testCount > 1 ? "s" : "") + " in " + (dateNow() - start).toFixed(2) + " ms.");
    writer.outdent();
  }

  function ignoreTag(code, symbolFilters) {
    if (symbolFilters[0].length === 0) {
      return false;
    }
    for (var i = 0; i < symbolFilters.length; i++) {
      var filterCode = SwfTag[symbolFilters[i]];
      if (filterCode !== undefined && filterCode === code) {
        return false;
      }
    }
    return true;
  }

  function extractABCsFromSWF(buffer: Uint8Array): AbcFile [] {
    var abcs = [];
    try {
      var loadListener: ILoadListener = {
        onLoadOpen: function(file: Shumway.SWF.SWFFile) {
          for (var i = 0; i < file.abcBlocks.length; i++) {
            var abcBlock = file.abcBlocks[i];
            var abcFile = new AbcFile(abcBlock.data, "TAG" + i);
            abcs.push(abcFile);
          }
        },
        onLoadProgress: function(update: LoadProgressUpdate) {
        },
        onLoadError: function() {
        },
        onLoadComplete: function() {
        },
        onNewEagerlyParsedSymbols(dictionaryEntries: SWF.EagerlyParsedDictionaryEntry[], delta: number): Promise<any> {
          return Promise.resolve();
        },
        onImageBytesLoaded() {}
      };
      var loader = new Shumway.FileLoader(loadListener);
      loader.loadBytes(buffer);
    } catch (x) {
      writer.redLn("Cannot parse SWF, reason: " + x);
      return null;
    }
    return abcs;
  }

  /**
   * Parses file.
   */
  function parseFile(file: string, parseForDatabase: boolean, symbolFilters: string []): boolean {
    var fileName = file.replace(/^.*[\\\/]/, '');
    function parseABC(buffer: ArrayBuffer) {
      new AbcFile(new Uint8Array(buffer), "ABC");
    }
    var buffers = [];
    if (file.endsWith(".swf")) {
      var fileNameWithoutExtension = fileName.substr(0, fileName.length - 4);
      var SWF_TAG_CODE_DO_ABC = SwfTag.CODE_DO_ABC;
      var SWF_TAG_CODE_DO_ABC_ = SwfTag.CODE_DO_ABC_DEFINE;
      try {
        var buffer = read(file, "binary");
        var startSWF = dateNow();
        var swfFile: Shumway.SWF.SWFFile;
        var loadListener: ILoadListener = {
          onLoadOpen: function(file: Shumway.SWF.SWFFile) {

          },
          onLoadProgress: function(update: LoadProgressUpdate) {

          },
          onLoadError: function() {
          },
          onLoadComplete: function() {
            writer.redLn("Load complete:");
            // TODO: re-enable all-tags parsing somehow. SWFFile isn't the right tool for that.
          //  var symbols = {};
          //  var tags = result.tags;
          //  var counter = new Metrics.Counter(true);
          //  for (var i = 0; i < tags.length; i++) {
          //    var tag = tags[i];
          //    assert(tag.code !== undefined);
          //    if (ignoreTag(tag.code, symbolFilters)) {
          //      continue;
          //    }
          //    var startTag = dateNow();
          //    if (!parseForDatabase) {
          //      if (tag.code === SWF_TAG_CODE_DO_ABC || tag.code === SWF_TAG_CODE_DO_ABC_) {
          //        parseABC(tag.data);
          //      } else {
          //        parseSymbol(tag, symbols);
          //      }
          //    }
          //    var tagName = SwfTag[tag.code];
          //    if (tagName) {
          //      tagName = tagName.substring("CODE_".length);
          //    } else {
          //      tagName = "TAG" + tag.code;
          //    }
          //    counter.count(tagName, 1, dateNow() - startTag);
          //  }
          //  if (parseForDatabase) {
          //    writer.writeLn(JSON.stringify({
          //                                    size: buffer.byteLength,
          //                                    time: dateNow() - startSWF,
          //                                    name: fileNameWithoutExtension,
          //                                    tags: counter.toJSON()
          //                                  }, null, 0));
          //  } else if (verbose) {
          //    writer.enter("Tag Frequency:");
          //    counter.traceSorted(writer);
          //    writer.outdent();
          //  }
          },
          onNewEagerlyParsedSymbols(dictionaryEntries: SWF.EagerlyParsedDictionaryEntry[],
                                    delta: number): Promise<any> {
            return Promise.resolve();
          },
          onImageBytesLoaded() {}
        };
        var loader = new Shumway.FileLoader(loadListener);
        loader.loadBytes(buffer);
      } catch (x) {
        writer.redLn("Cannot parse: " + file + ", reason: " + x);
        if (verbose) {
          writer.redLns(x.stack);
        }
        return false;
      }
    } else if (file.endsWith(".abc")) {
      parseABC(read(file, "binary"));
    }
    return true;
  }

  function createAVM2(builtinLibPath, shellLibPath?,  libraryPathInfo?) {
    var buffer = read(builtinLibPath, 'binary');
    var mode = interpreterOption.value ? Runtime.ExecutionMode.INTERPRET : Runtime.ExecutionMode.COMPILE;
    Runtime.AVM2.initialize(mode, mode);
    var avm2Instance = Runtime.AVM2.instance;
    Shumway.AVM2.AS.linkNatives(avm2Instance);
    avm2Instance.systemDomain.executeAbc(new AbcFile(new Uint8Array(buffer), "builtin.abc"));
    if (libraryPathInfo) {
      loadPlayerglobal(libraryPathInfo.abcs, libraryPathInfo.catalog);
    }
    if (shellLibPath) {
      var buffer = read(shellLibPath, 'binary');
      avm2Instance.systemDomain.executeAbc(new AbcFile(new Uint8Array(buffer), "shell.abc"));
    }
  }

  function initializeAVM2(loadPlayerglobal: boolean, loadShellLib: boolean) {
    createAVM2(builtinLibPath, loadShellLib ? shellLibPath : undefined, loadPlayerglobal ? playerglobalInfo : undefined);
  }

  function loadPlayerglobal(abcsPath, catalogPath) {
    var playerglobal = Shumway.AVM2.Runtime.playerglobal = {
      abcs: read(abcsPath, 'binary').buffer,
      map: Object.create(null),
      scripts: Object.create(null)
    };
    var catalog = JSON.parse(read(catalogPath));
    for (var i = 0; i < catalog.length; i++) {
      var abc = catalog[i];
      playerglobal.scripts[abc.name] = abc;
      if (typeof abc.defs === 'string') {
        playerglobal.map[abc.defs] = abc.name;
        writer.writeLn(abc.defs)
      } else {
        for (var j = 0; j < abc.defs.length; j++) {
          var def = abc.defs[j];
          playerglobal.map[def] = abc.name;
        }
      }
    }
  }
}

Shumway.Shell.main(commandLineArguments);
