"use strict";

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

define(['js/state.js'], function (state) {
  var localizer = {
    defaultLanguage: 'EN',
    language: 'EN',
    getLanguage: function getLanguage() {
      return localizer.language;
    },
    setLanguage: function setLanguage(language) {
      if (language !== undefined) {
        localizer.language = language;
      } else {
        localizer.language = localizer.defaultLanguage;
      }
    },
    getString: function getString(token) {
      if (localizer.translations.hasOwnProperty(localizer.language)) {
        if (localizer.translations[localizer.language].hasOwnProperty(token)) {
          if (localizer.translations[localizer.language][token].length > 0) {
            // console.log('localized, for ' + token + ' returning ' , localizer.translations[localizer.language][token]);
            return localizer.translations[localizer.language][token];
          } else {
            // console.log('unlocalized, for ' + token + ' returning ' , localizer.translations[localizer.defaultLanguage][token]);
            return localizer.translations[localizer.defaultLanguage][token];
          }
        }
      } // Cant find the string, just return the token so it's obvious it needs translation


      return token;
    },
    loadLocale: function loadLocale(locale) {
      var _localizer$translatio, _localizer$translatio2;

      switch (locale) {
        case 'EN':
          localizer.translations['EN'] = (_localizer$translatio = {
            'ENABLE_GRAFFITI': 'Enable Graffiti',
            'ACTIVATE_GRAFFITI': 'Activate Graffiti',
            'GRAFFITI_PRESENT': 'Graffiti is present on this line to the left.',
            'MOVIE_UNAVAILABLE': 'Movie is not available.',
            'MOVIE_UNAVAILABLE_EXPLANATION': 'We are sorry, we could not load this movie at this time. Please contact the author of this Notebook for help.',
            'FILE_UNAVAILABLE': 'File unavailable',
            'FILE_UNAVAILABLE_EXPLANATION': 'The file you requested with <i>%%insert_data_from_file</i> was not found.',
            'ACTIVATE_GRAFFITI_CONFIRM': 'Activate Graffiti On This Notebook?',
            'CREATE_1': 'Create',
            'CREATE_2': 'Record',
            'EDIT': 'Edit',
            'EDIT_TOOLTIP': 'Edit Tooltip / Graffiti Settings',
            'START_RECORDING': 'Start Recording',
            'END_RECORDING': 'End Recording',
            'RECORD': 'Record',
            'RECORD_MOVIE': 'Record movie',
            'RERECORD': 'Rerecord',
            'RERECORD_MOVIE': 'Rerecord movie',
            'START_PLAYBACK': 'Start playback',
            'PAUSE_PLAYBACK': 'Pause playback (spacebar)',
            'EXIT_PLAYBACK': 'Exit movie (restore notebook contents)',
            'MUTE': 'Mute audio',
            'UNMUTE': 'Unmute audio',
            'HIGH_SPEED_PLAYBACK': 'Switch to high speed playback',
            'REGULAR_SPEED_PLAYBACK': 'Switch to regular speed playback',
            'HIGH_SPEED_SILENCES': 'High Speed during silences',
            'REGULAR_SPEED_SILENCES': 'Regular Speed during silences',
            'SKIP_BACK': 'Skip back',
            'SKIP_FORWARD': 'Skip forward',
            'TO_PREVIOUS_SENTENCE': 'to previous sentence',
            'TO_NEXT_SENTENCE': 'to next sentence',
            'SECONDS': 'second',
            'SAVE_GRAFFITI': 'Save Graffiti',
            'REMOVE_GRAFFITI': 'Remove Graffiti',
            'BELOW_TYPE_MARKDOWN': "%% Below, type any markdown to display in the Graffiti tip.\n" + "%% Then run this cell to save it.\n",
            'SAMPLE_API': 'Create Sample API Calls',
            'SKIPS_API': 'Fast Forwards / Skips',
            'SKIPS_DIALOG_TITLE': 'Remove Fast Forwards & Skips on This Recording?',
            'SKIPS_DIALOG_BODY': 'This will remove all fast forwards and skips you have set. Are you positive?',
            'SKIPS_DIALOG_CONFIRM_1': 'Proceed',
            'SKIPS_DIALOG_CANCEL': 'Cancel',
            'SKIPS_HEADER': 'Fast Forwards & Skips',
            'SKIPS_COMPRESS_BTN': 'Compress time to fixed length',
            'SKIPS_2X_BTN': 'Set to fast forward at 2x speed',
            'SKIPS_3X_BTN': 'Set to fast forward at 3x speed',
            'SKIPS_4X_BTN': 'Set to fast forward at 4x speed'
          }, _defineProperty(_localizer$translatio, "SKIPS_COMPRESS_BTN", 'Compress time to fixed length'), _defineProperty(_localizer$translatio, 'SKIPS_ABSOLUTE_BTN', 'Skip a section entirely'), _defineProperty(_localizer$translatio, 'SKIPS_CLEAR_BTN', 'Remove all skips'), _defineProperty(_localizer$translatio, 'TAKES', 'Takes'), _defineProperty(_localizer$translatio, 'SELECT_SOME_TEXT_MARKDOWN', 'Select some text in this Markdown cell to add or modify Graffiti, or click inside any existing Graffiti text to modify it.'), _defineProperty(_localizer$translatio, 'EDIT_IN_MARKDOWN_CELL', 'Edit the Markdown cell to add or modify Graffiti in the cell, or use Graffiti Extras (below)'), _defineProperty(_localizer$translatio, 'SELECT_SOME_TEXT_PLAIN', 'Select some text in a cell to create or modify Graffiti, click inside any existing Graffiti text to modify that Graffiti, ' + 'or use Graffiti Extras (below)'), _defineProperty(_localizer$translatio, 'YOU_CAN_PLAY_VIA_TOOLTIP', 'You can play this movie any time via its tooltip.'), _defineProperty(_localizer$translatio, 'NO_MOVIE_RECORDED_YET', 'No movie has been recorded for this Graffiti yet.'), _defineProperty(_localizer$translatio, 'PLEASE_WAIT_STORING_MOVIE', 'Please wait, storing this movie...'), _defineProperty(_localizer$translatio, 'YOU_CAN_FILTER', 'You can filter this Notebook\'s Graffiti by clicking on creators in the list below.'), _defineProperty(_localizer$translatio, 'PAUSE_TO_INTERACT', '<span class="graffiti-notifier-link" id="graffiti-pause-link">Pause</span> (or scroll the page) to interact with this Notebook'), _defineProperty(_localizer$translatio, 'CANCEL_MOVIE_PLAYBACK_1', '<span class="graffiti-notifier-link" id="graffiti-cancel-playback-link">Cancel</span> movie playback (Esc)'), _defineProperty(_localizer$translatio, 'CANCEL_MOVIE_PLAYBACK_2', '<span class="graffiti-notifier-link" id="graffiti-cancel-playback-postreset-link">Cancel</span> movie playback (Esc)'), _defineProperty(_localizer$translatio, 'CANCEL_MOVIE_PLAYBACK_3', '<span class="graffiti-notifier-link" id="graffiti-cancel-playback-prereset-link">Cancel</span> movie playback (Esc)'), _defineProperty(_localizer$translatio, 'PLAY_MOVIE_AGAIN', '<span class="graffiti-notifier-link" id="graffiti-restart-play-link">Play movie again</span>'), _defineProperty(_localizer$translatio, 'CONTINUE_MOVIE_PLAYBACK', '<span class="graffiti-notifier-link" id="graffiti-continue-play-link">Continue</span> movie playback'), _defineProperty(_localizer$translatio, 'ENTER_AND_SAVE', 'Enter the markdown you want to be displayed in the Graffiti and then click "Save Graffiti"  (or just run the label cell).'), _defineProperty(_localizer$translatio, 'CANCEL_CHANGES_1', 'Or, <span class="graffiti-notifier-link" id="graffiti-cancel-graffiting-link">Cancel changes</span>'), _defineProperty(_localizer$translatio, 'CANCEL_CHANGES_2', 'Or, <span class="graffiti-notifier-link" id="graffiti-cancel-recording-labelling-link">Cancel changes</span>'), _defineProperty(_localizer$translatio, 'ENTER_MARKDOWN_MOVIE_DESCRIPTION', 'Enter markdown to describe your movie, then click "Start Recording" (or just run the label cell).'), _defineProperty(_localizer$translatio, 'CLICK_BEGIN_MOVIE_RECORDING', 'Click anywhere in the notebook to begin recording your movie.'), _defineProperty(_localizer$translatio, 'CANCEL_RECORDING_1', 'Or, <span class="graffiti-notifier-link" id="graffiti-cancel-recording-pending-link">Cancel recording</span>'), _defineProperty(_localizer$translatio, 'CANCEL_RECORDING_2', 'Or, <span class="graffiti-notifier-link" id="graffiti-cancel-recording-link">Cancel recording</span>'), _defineProperty(_localizer$translatio, 'RECORDING_HINT_1', '<div class="graffiti-keyboard-sim"><div>option/alt</div><div>key</div></div>'), _defineProperty(_localizer$translatio, 'RECORDING_HINT_2', '<span>Tap</span>: Pause Rec.'), _defineProperty(_localizer$translatio, 'RECORDING_HINT_3', '<span>Hold</span>: End Rec.'), _defineProperty(_localizer$translatio, 'RECORDING_HINT_4', '<div class="graffiti-keyboard-sim" style="color:red;"><div>Skipping</div><div>(option/alt to resume)</div></div>'), _defineProperty(_localizer$translatio, 'IS_SKIPPING', '--:--'), _defineProperty(_localizer$translatio, 'ACTIVITIES_BEING_RECORDED', 'Your activities are being recorded. Hold the option key down to end recording.'), _defineProperty(_localizer$translatio, 'LOADING', 'Loading... (ESC to cancel)'), _defineProperty(_localizer$translatio, 'LOADING_PLEASE_WAIT', 'Loading Graffiti movie, please wait...'), _defineProperty(_localizer$translatio, 'RECORDED_ON', 'Recorded'), _defineProperty(_localizer$translatio, 'PRESS_ESC_TO_END_MOVIE_PLAYBACK', 'Press ESC to end movie playback'), _defineProperty(_localizer$translatio, 'SHOW_GRAFFITI_EDITOR', 'Show Graffiti Editor'), _defineProperty(_localizer$translatio, 'HIDE_GRAFFITI_EDITOR', 'Hide Graffiti Editor'), _defineProperty(_localizer$translatio, 'ENTER_LABEL', 'Enter a label...'), _defineProperty(_localizer$translatio, 'FREEFORM_PEN_TOOL', 'Freeform pen tool'), _defineProperty(_localizer$translatio, 'HIGHLIGHTER_TOOL', 'Highlighter tool'), _defineProperty(_localizer$translatio, 'ERASER_TOOL', 'Eraser tool'), _defineProperty(_localizer$translatio, 'USE_DISAPPEARING_INK', 'Use disappearing ink'), _defineProperty(_localizer$translatio, 'USE_DASHED_LINES', 'Use dashed lines'), _defineProperty(_localizer$translatio, 'DASHED_LINES', 'Dashed lines'), _defineProperty(_localizer$translatio, 'TEMPORARY_INK', 'Temporary Ink'), _defineProperty(_localizer$translatio, 'SOLID_FILL', 'Solid Fill'), _defineProperty(_localizer$translatio, 'SHIFT_KEY_ALIGN', 'Shift-key: align items to grid / keep items square'), _defineProperty(_localizer$translatio, 'PLAY_CONFIRM', 'Are you sure you want to play this Graffiti?'), _defineProperty(_localizer$translatio, 'REPLACE_CONFIRM_BODY_1', 'This Graffiti movie may replace the contents of code cells. After this movie plays, do you want to...'), _defineProperty(_localizer$translatio, 'REPLACE_CONFIRM_BODY_2', 'Restore Cell Contents After Playback Ends'), _defineProperty(_localizer$translatio, 'REPLACE_CONFIRM_BODY_3', 'Let this Movie Permanently Set Cell Contents'), _defineProperty(_localizer$translatio, 'ACCESS_MICROPHONE_PROMPT', 'Please grant access to your browser\'s microphone.'), _defineProperty(_localizer$translatio, 'ACCESS_MICROPHONE_ADVISORY', 'You cannot record Graffiti movies unless you grant access to the microphone. ' + 'Please <a href="https://help.aircall.io/hc/en-gb/articles/115001425325-How-to-allow-Google-Chrome-to-access-your-microphone" ' + 'target="_">grant access</a> and then reload this page.'), _defineProperty(_localizer$translatio, 'ACTIVATE_GRAFFITI_ADVISORY', 'Enable Graffiti on this Notebook, so you can begin using Graffiti for the first time?<br>' + 'If you click Cancel, we will not change the notebook in any way.' + '<br><br><i>(This process merely adds some metadata to the cells, but does not otherwise change the Notebook\'s contents.)</i>'), _defineProperty(_localizer$translatio, 'SCRUB', 'scrub'), _defineProperty(_localizer$translatio, 'TOOLTIP_HINT', 'Without moving your mouse, click now to watch a movie about this.'), _defineProperty(_localizer$translatio, 'MOVIE_DURATION', 'Movie duration'), _defineProperty(_localizer$translatio, 'INSERT_GRAFFITI_BUTTON_CELL', '+ Insert Graffiti Button'), _defineProperty(_localizer$translatio, 'INSERT_GRAFFITI_BUTTON_CELL_ALT_TAG', 'Insert a Graffiti-enabled button'), _defineProperty(_localizer$translatio, 'INSERT_GRAFFITI_TERMINAL', '+ Insert Graffiti Terminal'), _defineProperty(_localizer$translatio, 'INSERT_GRAFFITI_TERMINAL_ALT_TAG', 'Insert a Graffiti-enabled terminal'), _defineProperty(_localizer$translatio, 'INSERT_GRAFFITI_TERMINAL_SUITE', '+ Insert Terminal Suite'), _defineProperty(_localizer$translatio, 'INSERT_GRAFFITI_TERMINAL_SUITE_ALT_TAG', 'Insert a code cell + terminal + button'), _defineProperty(_localizer$translatio, 'INSERT_TERMINAL_SUITE_STATUS', 'Inserting a terminal suite, please wait...'), _defineProperty(_localizer$translatio, 'JUMP_TO_NOTEBOOK_DIR', 'Jump to Notebook\'s Dir'), _defineProperty(_localizer$translatio, 'RESET_TERMINAL', 'Reset'), _defineProperty(_localizer$translatio, 'CELL_EXECUTES_GRAFFITI', 'Code Cell, Executes Graffiti'), _defineProperty(_localizer$translatio, 'CELL_EXECUTE_CHOICE', 'Now click on the element that contains the Graffiti you want this cell to run...'), _defineProperty(_localizer$translatio, 'CELL_EXECUTE_CHOICE_SET', 'Your choice has been saved.'), _defineProperty(_localizer$translatio, 'ACTIVATE_LOCK_ALT_TAG', 'Lock/unlock all markdown cells'), _defineProperty(_localizer$translatio, 'CHANGE_DATADIR_TAG', 'Change home directory for Graffiti data'), _defineProperty(_localizer$translatio, 'CREATE_SHOWHIDE_BUTTON', 'Create show/hide button'), _defineProperty(_localizer$translatio, 'LOCK_VERB', 'Lock'), _defineProperty(_localizer$translatio, 'UNLOCK_VERB', 'Unlock'), _defineProperty(_localizer$translatio, 'UNLOCK_BODY', 'This will unlock all markdown cells so you can edit them (note: terminal cells are always locked).'), _defineProperty(_localizer$translatio, 'LOCK_BODY', 'This will lock all markdown cells so they can no longer be edited.'), _defineProperty(_localizer$translatio, 'LOCK_CONFIRM', 'markdown cells in notebook?'), _defineProperty(_localizer$translatio, 'DATA_PATH_INSTRUCTIONS', "### Change Data Path?\n" + "You can tell Graffiti to store its data in another folder/path. " + "In the code cell below, put the _relative_ path to the folder where you want to store Graffiti data, " + "including the folder name and a trailing slash. " + "For example, suppose you want Graffiti to store its data one folder up in a directory called `graffitibits`. " + "Then you should enter `../graffitibits/` here. " + '(The default value is `jupytergraffiti_data/`, a folder in the same directory as this Notebook.)' + "\n\n" + "_Please Note:_ \n\n" + "* If you are unsure what to do, don't change the path and just hit the _Confirm_ button.\n" + "* If the data folder does not exist, Graffiti will create it when you create your first Graffiti for the notebook.\n" + "* Any Graffiti recorded previously in a different path will become unavailable. \n" + "* This cell, the path cell and Confirm button cell below will be automatically removed from the Notebook after you " + "click _Confirm_."), _defineProperty(_localizer$translatio, 'ACCEPTED_DATADIR_HEADER', 'Your new path for Graffiti has been accepted'), _defineProperty(_localizer$translatio, 'ACCEPTED_DATADIR_BODY', "Your Graffiti path has been changed. Now you must reload your notebook. \n\nYou can change this setting any time with " + 'the Data Directory button on the Graffiti Editor panel.'), _localizer$translatio);
          break;

        case 'CN':
          localizer.translations['CN'] = (_localizer$translatio2 = {
            'ENABLE_GRAFFITI': '启用 Graffiti',
            'ACTIVATE_GRAFFITI': '开始使用 Graffiti ',
            'GRAFFITI_PRESENT': '本行有 Graffiti ，请查阅',
            'MOVIE_UNAVAILABLE': '视频不存在',
            'MOVIE_UNAVAILABLE_EXPLANATION': '抱歉，我们目前无法加载该视频。请联系创建该 Notebook 的作者寻求帮助。',
            'FILE_UNAVAILABLE': 'File unavailable',
            'FILE_UNAVAILABLE_EXPLANATION': 'The file you requested with `%%insert_data_from_file` was not available',
            'ACTIVATE_GRAFFITI_CONFIRM': '是否在该 Notebook 上启用 Graffiti？',
            'CREATE_1': '创建',
            'CREATE_2': '创建',
            'EDIT': '编辑',
            'EDIT_TOOLTIP': '编辑 Graffiti 提示框',
            'START_RECORDING': '开始录屏',
            'END_RECORDING': '结束录屏',
            'RECORD': '录屏',
            'RECORD_MOVIE': '录制视频',
            'RERECORD': '重录',
            'RERECORD_MOVIE': '重新录制',
            'START_PLAYBACK': '开始回放',
            'PAUSE_PLAYBACK': '终止回放 (spacebar)',
            'EXIT_PLAYBACK': 'Exit movie (restore notebook contents)',
            'MUTE': '静音',
            'UNMUTE': '取消静音',
            'HIGH_SPEED_PLAYBACK': '快速回放',
            'REGULAR_SPEED_PLAYBACK': '正常回放',
            'HIGH_SPEED_SILENCES': '无人说话的片段快速播放',
            'REGULAR_SPEED_SILENCES': '无人说话的片段正常播放',
            'SKIP_BACK': '快退',
            'SKIP_FORWARD': '快进',
            'TO_PREVIOUS_SENTENCE': '到前一句',
            'TO_NEXT_SENTENCE': '到下一句',
            'SECONDS': '秒',
            'SAVE_GRAFFITI': '保留 Graffiti ',
            'REMOVE_GRAFFITI': '移除 Graffiti ',
            'BELOW_TYPE_MARKDOWN': '在以下输入 markdown 文本，将展示在 Graffiti 中。' + '然后运行文本以保存。',
            'SAMPLE_API': '创建示例 API Calls',
            'SKIPS_API': 'Fast Forwards / Skips',
            'SKIPS_DIALOG_TITLE': 'Remove Fast Forwards & Skips on This Recording?',
            'SKIPS_DIALOG_BODY': 'This will remove all fast forwards and skips you have set. Are you positive?',
            'SKIPS_DIALOG_CONFIRM_1': 'Proceed',
            'SKIPS_DIALOG_CANCEL': 'Cancel',
            'SKIPS_HEADER': 'Fast Forwards & Skips',
            'SKIPS_COMPRESS_BTN': 'Compress time to fixed length',
            'SKIPS_2X_BTN': 'Set to fast forward at 2x speed',
            'SKIPS_3X_BTN': 'Set to fast forward at 3x speed',
            'SKIPS_4X_BTN': 'Set to fast forward at 4x speed'
          }, _defineProperty(_localizer$translatio2, "SKIPS_COMPRESS_BTN", 'Compress time to fixed length'), _defineProperty(_localizer$translatio2, 'SKIPS_ABSOLUTE_BTN', 'Skip a section entirely'), _defineProperty(_localizer$translatio2, 'SKIPS_CLEAR_BTN', 'Remove all skips'), _defineProperty(_localizer$translatio2, 'TAKES', '版本'), _defineProperty(_localizer$translatio2, 'SELECT_SOME_TEXT_MARKDOWN', '选择文本以创建或者修改 Graffiti，或者点击已有的 Graffiti 进行修改'), _defineProperty(_localizer$translatio2, 'EDIT_IN_MARKDOWN_CELL', 'Edit the Markdown cell to add or modify Graffiti in the cell, or use Graffiti Extras (below)'), _defineProperty(_localizer$translatio2, 'SELECT_SOME_TEXT_PLAIN', 'Select some text in a cell to create or modify Graffiti, click inside any existing Graffiti text to modify that Graffiti, ' + 'or use Graffiti Extras (below)'), _defineProperty(_localizer$translatio2, 'YOU_CAN_PLAY_VIA_TOOLTIP', '你可以通过提示框随时播放此视频'), _defineProperty(_localizer$translatio2, 'NO_MOVIE_RECORDED_YET', 'No movie has been recorded for this Graffiti yet.'), _defineProperty(_localizer$translatio2, 'PLEASE_WAIT_STORING_MOVIE', '稍等，视频存储中...'), _defineProperty(_localizer$translatio2, 'YOU_CAN_FILTER', '点击列表里的创建者，筛选 Notebook 里的 Graffiti'), _defineProperty(_localizer$translatio2, 'PAUSE_TO_INTERACT', '<span class="graffiti-notifier-link" id="graffiti-pause-link">暂停</span>（或者下拉页面），可以继续在 Notebook 上的操作'), _defineProperty(_localizer$translatio2, 'CANCEL_MOVIE_PLAYBACK_1', '<span class="graffiti-notifier-link" id="graffiti-cancel-playback-link">取消</span>视频回放（或者使用 Esc 按键）'), _defineProperty(_localizer$translatio2, 'CANCEL_MOVIE_PLAYBACK_2', '<span class="graffiti-notifier-link" id="graffiti-cancel-playback-postreset-link">取消</span>视频回放（或者使用 Esc 按键）'), _defineProperty(_localizer$translatio2, 'CANCEL_MOVIE_PLAYBACK_3', '<span class="graffiti-notifier-link" id="graffiti-cancel-playback-prereset-link">取消</span>视频回放（或者使用 Esc 按键）'), _defineProperty(_localizer$translatio2, 'PLAY_MOVIE_AGAIN', '<span class="graffiti-notifier-link" id="graffiti-restart-play-link">重新播放视频</span>'), _defineProperty(_localizer$translatio2, 'CONTINUE_MOVIE_PLAYBACK', '<span class="graffiti-notifier-link" id="graffiti-continue-play-link">继续</span>回放视频'), _defineProperty(_localizer$translatio2, 'ENTER_AND_SAVE', '输入你想在 Graffiti 里展示的文本内容，完成后点击“保存 Graffiti”（或者运行单元格以保存）'), _defineProperty(_localizer$translatio2, 'CANCEL_CHANGES_1', '或者<span class="graffiti-notifier-link" id="graffiti-cancel-graffiting-link">取消更改</span>'), _defineProperty(_localizer$translatio2, 'CANCEL_CHANGES_2', '或者<span class="graffiti-notifier-link" id="graffiti-cancel-recording-labelling-link">取消更改</span>'), _defineProperty(_localizer$translatio2, 'ENTER_MARKDOWN_MOVIE_DESCRIPTION', '输入视频描述文字，点击“开始录屏”（或者运行单元格以开始）'), _defineProperty(_localizer$translatio2, 'CLICK_BEGIN_MOVIE_RECORDING', '点击 Notebook 的任何一处，开始录屏'), _defineProperty(_localizer$translatio2, 'CANCEL_RECORDING_1', '或者<span class="graffiti-notifier-link" id="graffiti-cancel-recording-pending-link">取消录制</span>'), _defineProperty(_localizer$translatio2, 'CANCEL_RECORDING_2', '或者<span class="graffiti-notifier-link" id="graffiti-cancel-recording-link">取消录制</span>'), _defineProperty(_localizer$translatio2, 'RECORDING_HINT_1', '<div class="graffiti-keyboard-sim"><div>option/alt</div><div>key</div></div>'), _defineProperty(_localizer$translatio2, 'RECORDING_HINT_2', '<span>Tap</span>: Pause Rec.'), _defineProperty(_localizer$translatio2, 'RECORDING_HINT_3', '<span>Hold</span>: End Rec.'), _defineProperty(_localizer$translatio2, 'RECORDING_HINT_4', '<div class="graffiti-keyboard-sim" style="color:red;"><div>Skipping</div><div>(option/alt to resume)</div></div>'), _defineProperty(_localizer$translatio2, 'IS_SKIPPING', '--:--'), _defineProperty(_localizer$translatio2, 'ACTIVITIES_BEING_RECORDED', '录屏进行中' + '按键 ⌘-M 或者点击<span class="graffiti-notifier-link" id="graffiti-end-recording-link">结束录屏</span> ' + '以终止录制'), _defineProperty(_localizer$translatio2, 'LOADING', '加载中 (ESC to cancel)'), _defineProperty(_localizer$translatio2, 'LOADING_PLEASE_WAIT', '正在加载 Graffiti 视频，请稍等...'), _defineProperty(_localizer$translatio2, 'RECORDED_ON', '已录制'), _defineProperty(_localizer$translatio2, 'PRESS_ESC_TO_END_MOVIE_PLAYBACK', '按键 ESC 结束视频回放'), _defineProperty(_localizer$translatio2, 'SHOW_GRAFFITI_EDITOR', '显示 Graffiti 编辑器'), _defineProperty(_localizer$translatio2, 'HIDE_GRAFFITI_EDITOR', '隐藏 Graffiti 编辑器'), _defineProperty(_localizer$translatio2, 'ENTER_LABEL', '创建标签'), _defineProperty(_localizer$translatio2, 'FREEFORM_PEN_TOOL', '自由图形画笔'), _defineProperty(_localizer$translatio2, 'HIGHLIGHTER_TOOL', '高亮工具'), _defineProperty(_localizer$translatio2, 'ERASER_TOOL', '橡皮擦'), _defineProperty(_localizer$translatio2, 'USE_DISAPPEARING_INK', '使用渐消墨水'), _defineProperty(_localizer$translatio2, 'USE_DASHED_LINES', '使用虚线'), _defineProperty(_localizer$translatio2, 'DASHED_LINES', '虚线'), _defineProperty(_localizer$translatio2, 'TEMPORARY_INK', '渐消墨水'), _defineProperty(_localizer$translatio2, 'SOLID_FILL', '填充图形'), _defineProperty(_localizer$translatio2, 'SHIFT_KEY_ALIGN', '按住 Shift 键，图形自动对齐'), _defineProperty(_localizer$translatio2, 'PLAY_CONFIRM', '是否确认播放该 Graffiti 视频？'), _defineProperty(_localizer$translatio2, 'REPLACE_CONFIRM_BODY_1', '播放 Graffiti 视频可能会更改代码单元格内容，你可以选择在播放后'), _defineProperty(_localizer$translatio2, 'REPLACE_CONFIRM_BODY_2', '还原之前的单元格内容'), _defineProperty(_localizer$translatio2, 'REPLACE_CONFIRM_BODY_3', '允许视频更新单元格内容'), _defineProperty(_localizer$translatio2, 'ACCESS_MICROPHONE_PROMPT', '请允许使用目前浏览器的麦克风'), _defineProperty(_localizer$translatio2, 'ACCESS_MICROPHONE_ADVISORY', '请允许使用麦克风，否则无法录屏' + '请 <a href="https://help.aircall.io/hc/en-gb/articles/115001425325-How-to-allow-Google-Chrome-to-access-your-microphone" ' + 'target="_">允许使用</a>并重新加载该页面'), _defineProperty(_localizer$translatio2, 'ACTIVATE_GRAFFITI_ADVISORY', '在该 Notebook 上启用 Graffiti，就能进行录屏操作啦' + '如果点击取消，不会更改 notebook' + '<br><br><i>(该操作只会增加单元格的元数据，不会更改 Notebook 的内容)</i>'), _defineProperty(_localizer$translatio2, 'SCRUB', 'scrub'), _defineProperty(_localizer$translatio2, 'TOOLTIP_HINT', 'Click the underlined text (below) to watch a movie about this.'), _defineProperty(_localizer$translatio2, 'MOVIE_DURATION', 'Movie duration'), _defineProperty(_localizer$translatio2, 'INSERT_GRAFFITI_BUTTON_CELL', '+ Graffiti Button'), _defineProperty(_localizer$translatio2, 'INSERT_GRAFFITI_BUTTON_CELL_ALT_TAG', 'Insert a Graffiti-enabled button'), _defineProperty(_localizer$translatio2, 'INSERT_GRAFFITI_TERMINAL', '+ Terminal'), _defineProperty(_localizer$translatio2, 'INSERT_GRAFFITI_TERMINAL_ALT_TAG', 'Insert a Graffiti-enabled terminal'), _defineProperty(_localizer$translatio2, 'INSERT_GRAFFITI_TERMINAL_SUITE', '+ Terminal Suite'), _defineProperty(_localizer$translatio2, 'INSERT_GRAFFITI_TERMINAL_SUITE_ALT_TAG', 'Insert a code cell + terminal + button'), _defineProperty(_localizer$translatio2, 'INSERT_TERMINAL_SUITE_STATUS', 'Inserting a terminal suite, please wait...'), _defineProperty(_localizer$translatio2, 'JUMP_TO_NOTEBOOK_DIR', 'Jump to Notebook\'s Dir'), _defineProperty(_localizer$translatio2, 'RESET_TERMINAL', 'Reset'), _defineProperty(_localizer$translatio2, 'CELL_EXECUTES_GRAFFITI', 'Code Cell, Executes Graffiti'), _defineProperty(_localizer$translatio2, 'CELL_EXECUTE_CHOICE', 'Now click on the element that contains the Graffiti you want this cell to run...'), _defineProperty(_localizer$translatio2, 'CELL_EXECUTE_CHOICE_SET', 'Your choice has been saved.'), _defineProperty(_localizer$translatio2, 'ACTIVATE_LOCK_ALT_TAG', 'Lock/unlock all markdown cells'), _defineProperty(_localizer$translatio2, 'CHANGE_DATADIR_TAG', 'Change home directory for Graffiti data'), _defineProperty(_localizer$translatio2, 'CREATE_SHOWHIDE_BUTTON', 'Create show/hide button'), _defineProperty(_localizer$translatio2, 'LOCK_VERB', 'Lock'), _defineProperty(_localizer$translatio2, 'UNLOCK_VERB', 'Unlock'), _defineProperty(_localizer$translatio2, 'UNLOCK_BODY', 'This will unlock all markdown cells so you can edit them (note: terminal cells are always locked).'), _defineProperty(_localizer$translatio2, 'LOCK_BODY', 'This will lock all markdown cells so they can no longer be edited.'), _defineProperty(_localizer$translatio2, 'LOCK_CONFIRM', 'markdown cells in notebook?'), _defineProperty(_localizer$translatio2, 'DATA_PATH_INSTRUCTIONS', "### Change Data Path?\n" + "You can tell Graffiti to store its data in another folder/path. " + "In the code cell below, put the _relative_ path to the folder where you want to store Graffiti data, " + "including the folder name and a trailing slash. " + "For example, suppose you want Graffiti to store its data one folder up in a directory called `graffitibits`. " + "Then you should enter `../graffitibits/` here. " + '(The default value is `jupytergraffiti_data/`, a folder in the same directory as this Notebook.)' + "\n\n" + "_Please Note:_ \n\n" + "* If you are unsure what to do, don't change the path and just hit the _Confirm_ button.\n" + "* If the data folder does not exist, Graffiti will create it when you create your first Graffiti for the notebook.\n" + "* Any Graffiti recorded previously in a different path will become unavailable. \n" + "* This cell, the path cell and Confirm button cell below will be automatically removed from the Notebook after you " + "click _Confirm_."), _defineProperty(_localizer$translatio2, 'ACCEPTED_DATADIR_HEADER', 'Your new path for Graffiti has been accepted'), _defineProperty(_localizer$translatio2, 'ACCEPTED_DATADIR_BODY', "Your Graffiti path has been changed. Now you must reload your notebook. \n\nYou can change this setting any time with " + 'the Data Directory button on the Graffiti Editor panel.'), _localizer$translatio2);
          break;
      }
    },
    init: function init() {
      localizer.translations = {};
      localizer.loadLocale('EN');
      localizer.loadLocale('CN');
      var notebook = Jupyter.notebook;
      localizer.setLanguage('EN');

      if (notebook.metadata.hasOwnProperty('graffiti')) {
        if (notebook.metadata.graffiti.hasOwnProperty('language')) {
          localizer.setLanguage(notebook.metadata.graffiti.language);
        }
      } // Load localized strings for China. Paths not working right now, so we're using an inline solution instead, see above

      /*      
            return new Promise((resolve) => {
              requirejs(['/nbextensions/graffiti_extension/js/locales/cn/strings.js'], function (strings) {
                console.log('Fetched lang strings');
                localizer.translations['CN'] = strings.getTranslations();
                console.log('we loaded chinese translations.');
                //localizer.setLanguage('CN');
                resolve();
              });
            });
      */


      return Promise.resolve();
    }
  };
  return localizer;
});