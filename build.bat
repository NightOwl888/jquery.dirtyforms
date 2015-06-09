@echo off
GOTO endcommentblock
:: -----------------------------------------------------------------------------------
:: This file will build jquery.dirtyforms and package the distribution using Nuget.
::
:: Syntax:
::   build[.bat] [<options>]
::
:: Available Options:
::
::   -Version:<Version>
::   -v:<Version> - Version number. Default is empty (which means to use the version from the package.json file).
::					If not supplied, a build and NuGet pack is performed rather than a full release.
::
::   All options are case insensitive.
::
::   To escape any of the options, put double quotes around the entire value, like this:
::   "-config:Release"
::
:: -----------------------------------------------------------------------------------
:endcommentblock
setlocal enabledelayedexpansion enableextensions

REM Default values
set version=
IF "%PackageVersion%" == "" (
    set version=%PackageVersion%
)

FOR %%a IN (%*) DO (
	FOR /f "useback tokens=*" %%a in ('%%a') do (
		set value=%%~a

		set test=!value:~0,3!
		IF /I !test! EQU -v: (
			set version=!value:~3!
		)

		set test=!value:~0,9!
		IF /I !test! EQU -version: (
			set version=!value:~9!
		)
	)
)

call npm install
if "version" == "" (
	call node_modules\.bin\gulp
) else (
	call node_modules\.bin\gulp release --version=%version%
)